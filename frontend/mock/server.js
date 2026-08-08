import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import jsonServer from 'json-server';
import multer from 'multer';

const here = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 4000;
const TITLE_LIMIT = 100;
const DESCRIPTION_LIMIT = 500;
const RECOVERY_CODE_TTL_MS = 10 * 60 * 1000;

// Коды сброса пароля живут только в памяти: эмейл-доставки в моке нет, поэтому код выводится в консоль и в ответ
const recoveryCodes = new Map();

function readPasswords(passwordsPath) {
  try {
    return JSON.parse(readFileSync(passwordsPath, 'utf8'));
  } catch {
    return {};
  }
}

function writePasswords(passwordsPath, passwords) {
  writeFileSync(passwordsPath, JSON.stringify(passwords, null, 2) + '\n');
}

function decodeToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (typeof payload.sub !== 'string') return null;
    if (typeof payload.exp !== 'number' || Date.now() >= payload.exp) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function publicItem(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    categoryId: item.categoryId ?? null,
    image: item.image ?? null,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// Публичный участник цепочки: userId/name нужны для аватаров, isCurrentUser — «это я?» (макет §4.8).
// offeredItem — товар участника: ref { id, title, image } + описание/категория (inline-поля товара),
// чтобы экран товара цепочки (макет 4.7) не ходил за ними отдельным запросом.
function publicParticipant(participant, userId, db) {
  const offered = participant.offeredItem;
  const item = offered ? db.get('items').getById(offered.id).value() : null;
  const image = offered?.image ?? item?.image ?? null;
  return {
    position: participant.position,
    requestId: participant.requestId ?? null,
    isCurrentUser: participant.userId === userId,
    user: { id: participant.userId, name: participant.name },
    offeredItem: offered
      ? {
          id: offered.id,
          title: offered.title,
          image,
          description: item?.description ?? null,
          categoryId: item?.categoryId ?? null,
        }
      : null,
    receivesFromPosition: participant.receivesFromPosition,
    responseStatus: participant.responseStatus ?? null,
    freezeVoteStatus: participant.freezeVoteStatus ?? null,
  };
}

function chainReadiness(chain) {
  const total = chain.participants.length;
  const accepted = chain.participants.filter((p) => p.responseStatus === 'ACCEPTED').length;
  return { accepted, total, ready: total > 0 && accepted === total };
}

// Права зависят от зрителя и не дублируют бизнес-логику на фронте: флаги считает бэкенд (PROJECT.md §4.4).
// Выбор цепочки делает владелец заявки; ответить может любой участник, ещё не ответивший и не просрочивший дедлайн.
function chainPermissions(chain, db, userId) {
  const request = chain.requestId
    ? db.get('exchangeRequests').getById(chain.requestId).value()
    : null;
  const isOwner = Boolean(request && request.userId === userId);
  const myParticipant = chain.participants.find((p) => p.userId === userId);
  const deadlinePassed = Boolean(
    chain.responseDeadlineAt && new Date(chain.responseDeadlineAt) <= new Date(),
  );
  return {
    canRespond:
      chain.status === 'CANDIDATE' &&
      Boolean(myParticipant) &&
      myParticipant.responseStatus == null &&
      !deadlinePassed,
    // выбор не эксклюзивен и не требует собранной цепочки: владелец отмечает любые варианты (макет 4.6)
    canSelect: chain.status === 'CANDIDATE' && isOwner,
    canDeselect: chain.status === 'PROPOSED' && isOwner,
    canVote: false,
    canRequestReplacement: false,
  };
}

function publicChain(chain, db, userId) {
  return {
    id: chain.id,
    requestId: chain.requestId,
    status: chain.status,
    score: chain.score,
    responseDeadlineAt: chain.responseDeadlineAt ?? null,
    freezeDeadlineAt: chain.freezeDeadlineAt ?? null,
    participants: chain.participants.map((p) => publicParticipant(p, userId, db)),
    viewerPermissions: chainPermissions(chain, db, userId),
  };
}

// Поля товара приходят и из multipart (строки), и из JSON — приводим к одному виду и валидируем.
function parseItemFields(body, { partial = false } = {}) {
  const patch = {};
  const has = (key) => body?.[key] !== undefined;
  if (has('title')) {
    const title = String(body.title).trim();
    if (!title) return { error: 'Название обязательно' };
    if (title.length > TITLE_LIMIT) return { error: `Название не длиннее ${TITLE_LIMIT} символов` };
    patch.title = title;
  }
  if (has('description')) {
    const description = String(body.description).trim();
    if (!description) return { error: 'Описание обязательно' };
    if (description.length > DESCRIPTION_LIMIT) {
      return { error: `Описание не длиннее ${DESCRIPTION_LIMIT} символов` };
    }
    patch.description = description;
  }
  if (has('categoryId')) {
    const categoryId = body.categoryId == null ? '' : String(body.categoryId).trim();
    patch.categoryId = categoryId ? categoryId : null;
  }

  if (!partial && !patch.title) return { error: 'Название обязательно' };
  if (!partial && !patch.description) return { error: 'Описание обязательно' };
  return { patch };
}

export function createMockApp({
  dbPath = join(here, 'db.json'),
  passwordsPath = join(here, 'passwords.json'),
} = {}) {
  const server = jsonServer.create();
  const router = jsonServer.router(dbPath);
  const db = router.db;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  server.use(jsonServer.defaults());
  server.use(jsonServer.bodyParser);

  const fail = (res, code, message) => res.status(code).json({ error: message, code });
  const findItem = (itemId) => db.get('items').getById(itemId).value();
  const findUserByEmail = (email) =>
    db
      .get('users')
      .find((u) => u.email === email)
      .value();

  const issueRecoveryCode = (email) => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    recoveryCodes.set(email, { code, expiresAt: Date.now() + RECOVERY_CODE_TTL_MS });
    return code;
  };

  const recoveryCodeIsValid = (email, code) => {
    const entry = recoveryCodes.get(email);
    if (!entry || entry.code !== code || Date.now() >= entry.expiresAt) return false;
    return true;
  };

  server.post('/api/v1/account/password-recovery/send-code/', (req, res) => {
    const { email } = req.body ?? {};
    const user = email ? findUserByEmail(email) : undefined;
    if (!user) return fail(res, 404, 'Пользователь с таким email не найден');

    const code = issueRecoveryCode(email);
    // доставки по эмейлу в моке нет — код логируется и возвращается в ответе, чтобы флоу можно было пройти вручную
    console.log(`[mock] recovery code for ${email}: ${code}`);
    res.json({ message: 'code_sent', code });
  });

  server.post('/api/v1/account/password-recovery/verify-code/', (req, res) => {
    const { email, code } = req.body ?? {};
    if (!recoveryCodeIsValid(email, code)) return fail(res, 400, 'Неверный или истёкший код');
    res.json({ message: 'code_valid' });
  });

  server.post('/api/v1/account/password-recovery/reset-password/', (req, res) => {
    const { email, code, password } = req.body ?? {};
    if (!recoveryCodeIsValid(email, code)) return fail(res, 400, 'Неверный или истёкший код');
    if (typeof password !== 'string' || password.length < 8) {
      return fail(res, 400, 'Пароль должен быть не короче 8 символов');
    }

    const user = findUserByEmail(email);
    if (!user) return fail(res, 404, 'Пользователь с таким email не найден');

    const passwords = readPasswords(passwordsPath);
    passwords[user.id] = password;
    writePasswords(passwordsPath, passwords);
    recoveryCodes.delete(email);
    res.json({ message: 'password_changed' });
  });

  server.use('/api/v1', (req, res, next) => {
    const auth = req.headers.authorization ?? '';
    const userId = decodeToken(auth.replace(/^Bearer\s+/i, ''));
    if (!userId) return fail(res, 401, 'Требуется авторизация');
    req.userId = userId;
    next();
  });

  server.get('/api/v1/items', (req, res) => {
    const items = db
      .get('items')
      .filter((i) => i.userId === req.userId)
      .value();
    res.json(items.map(publicItem));
  });

  server.get('/api/v1/items/:id', (req, res) => {
    const item = findItem(req.params.id);
    if (!item || item.userId !== req.userId) return fail(res, 404, 'Товар не найден');
    res.json(publicItem(item));
  });

  const toImageDataUri = (file) =>
    file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : null;

  server.post('/api/v1/items', upload.single('image'), (req, res) => {
    const { patch, error } = parseItemFields(req.body);
    if (error) return fail(res, 400, error);
    if (!req.file) return fail(res, 400, 'Нужно загрузить фото товара');

    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      userId: req.userId,
      ...patch,
      image: toImageDataUri(req.file),
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    db.get('items').insert(item).write();
    res.status(201).json(publicItem(item));
  });

  server.patch('/api/v1/items/:id', upload.single('image'), (req, res) => {
    const item = findItem(req.params.id);
    if (!item || item.userId !== req.userId) return fail(res, 404, 'Товар не найден');

    const { patch, error } = parseItemFields(req.body, { partial: true });
    if (error) return fail(res, 400, error);
    if (req.file) {
      patch.image = toImageDataUri(req.file);
    } else if (req.body?.image === null) {
      patch.image = null;
    }

    db.get('items')
      .updateById(item.id, { ...patch, updatedAt: new Date().toISOString() })
      .write();
    res.json(publicItem(findItem(item.id)));
  });

  // «Архивировать» (PROJECT.md §4.2): товар исчезает из списка, связанные заявки удаляются
  server.delete('/api/v1/items/:id', (req, res) => {
    const item = findItem(req.params.id);
    if (!item || item.userId !== req.userId) return fail(res, 404, 'Товар не найден');
    // «товар в сделке» — это в первую очередь заявка со статусом LOCKED; item.status === 'RESERVED'
    // лишь её отражение и может отстать, поэтому проверяем оба признака
    const lockedByRequest = db
      .get('exchangeRequests')
      .some((r) => r.offeredItemId === item.id && r.status === 'LOCKED')
      .value();
    if (item.status === 'RESERVED' || lockedByRequest) {
      return fail(res, 409, 'Товар уже участвует в сделке');
    }

    // заявки товара удаляются каскадом, а вместе с ними и их цепочки:
    // осиротевшая цепочка ссылалась бы на несуществующую заявку (POST /chains/:id/select → 403 вместо 404)
    const requestIds = db
      .get('exchangeRequests')
      .filter((r) => r.offeredItemId === item.id)
      .map((r) => r.id)
      .value();
    db.get('items').removeById(item.id).write();
    db.get('exchangeRequests')
      .removeWhere((r) => r.offeredItemId === item.id)
      .write();
    db.get('chains')
      .removeWhere((c) => requestIds.includes(c.requestId))
      .write();
    res.json({ message: 'archived' });
  });

  // Цепочки по заявке (PROJECT.md §4.4): кандидаты и активные сделки владельца заявки
  server.get('/api/v1/exchange-requests/:id/chains', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value();
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден');

    const chains = db
      .get('chains')
      .filter((c) => c.requestId === request.id && c.status !== 'CANCELLED')
      .value()
      .sort((a, b) => b.score - a.score);
    res.json(chains.map((c) => publicChain(c, db, req.userId)));
  });

  // Полная карточка цепочки: participants + viewerPermissions — источник правды для действий (PROJECT.md §4.4)
  server.get('/api/v1/chains/:chainId', (req, res) => {
    const chain = db.get('chains').getById(req.params.chainId).value();
    if (!chain) return fail(res, 404, 'Цепочка не найдена');
    const request = chain.requestId
      ? db.get('exchangeRequests').getById(chain.requestId).value()
      : null;
    const isParticipant = chain.participants.some((p) => p.userId === req.userId);
    if (!isParticipant && (!request || request.userId !== req.userId)) {
      return fail(res, 403, 'Вы не участник цепочки');
    }
    res.json(publicChain(chain, db, req.userId));
  });

  const respondToChain = (kind) => (req, res) => {
    const chain = db.get('chains').getById(req.params.chainId).value();
    if (!chain) return fail(res, 404, 'Цепочка не найдена');
    const participant = chain.participants.find((p) => p.userId === req.userId);
    if (!participant) return fail(res, 403, 'Вы не участник цепочки');
    if (chain.status !== 'CANDIDATE') return fail(res, 409, 'Цепочка уже перешла в другой статус');
    if (participant.responseStatus) return fail(res, 409, 'Вы уже ответили на отклик');
    // дедлайн ответа уже прошёл — отклик не принимается (PROJECT.md §4.4, ошибка 410);
    // фронт прячет кнопку по canRespond, но прямой вызов API должен получать тот же результат
    if (chain.responseDeadlineAt && new Date(chain.responseDeadlineAt) <= new Date()) {
      return fail(res, 410, 'Время на ответ истекло');
    }

    const responseStatus = kind === 'accept' ? 'ACCEPTED' : 'DECLINED';
    const participants = chain.participants.map((p) =>
      p.userId === req.userId ? { ...p, responseStatus } : p,
    );
    db.get('chains').updateById(chain.id, { participants }).write();
    const updated = db.get('chains').getById(chain.id).value();
    const { ready } = chainReadiness(updated);
    res.json({ chainId: updated.id, status: updated.status, isReadyForSelection: ready });
  };

  server.post('/api/v1/chains/:chainId/responses/accept', respondToChain('accept'));
  server.post('/api/v1/chains/:chainId/responses/decline', respondToChain('decline'));

  // Выбор цепочки владельцем заявки (PROJECT.md §4.5). Выбор не эксклюзивен: владелец может
  // отметить любое количество вариантов, остальные цепочки и заявка при этом не блокируются.
  // общая проверка доступа для выбора и его отмены; отвечает ошибкой и возвращает null, если доступа нет
  const selectableChain = (req, res) => {
    const chain = db.get('chains').getById(req.params.chainId).value();
    if (!chain) {
      fail(res, 404, 'Цепочка не найдена');
      return null;
    }
    const request = db.get('exchangeRequests').getById(chain.requestId).value();
    if (!request || request.userId !== req.userId) {
      fail(res, 403, 'Вы не владелец заявки');
      return null;
    }
    if (request.status !== 'ACTIVE' && request.status !== 'IN_PROPOSAL') {
      fail(res, 409, 'Заявка уже в финальном статусе');
      return null;
    }
    return chain;
  };

  server.post('/api/v1/chains/:chainId/select', (req, res) => {
    const chain = selectableChain(req, res);
    if (!chain) return;
    if (chain.status !== 'CANDIDATE') return fail(res, 409, 'Цепочка уже выбрана');

    db.get('chains').updateById(chain.id, { status: 'PROPOSED' }).write();
    res.json({ id: chain.id, status: 'PROPOSED' });
  });

  server.delete('/api/v1/chains/:chainId/select', (req, res) => {
    const chain = selectableChain(req, res);
    if (!chain) return;
    if (chain.status !== 'PROPOSED') return fail(res, 409, 'Цепочка не была выбрана');

    db.get('chains').updateById(chain.id, { status: 'CANDIDATE' }).write();
    res.json({ id: chain.id, status: 'CANDIDATE' });
  });

  server.use('/api/v1', (req, res) => fail(res, 404, 'Эндпоинт не найден'));

  server.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.code === 'LIMIT_FILE_SIZE') return fail(res, 400, 'Файл не больше 5 МБ');
    const code = Number.isInteger(err?.status) ? err.status : 500;
    fail(res, code, err?.message ?? 'Внутренняя ошибка сервера');
  });

  return server;
}

export function startMockServer(port = DEFAULT_PORT) {
  return createMockApp().listen(port, () => {
    console.log(`Mock API: http://localhost:${port}/api/v1`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMockServer(Number(process.env.MOCK_PORT) || DEFAULT_PORT);
}
