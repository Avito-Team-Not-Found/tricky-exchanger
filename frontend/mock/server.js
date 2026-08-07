import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import jsonServer from 'json-server';
import multer from 'multer';

const here = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 4000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const TITLE_LIMIT = 100;
const DESCRIPTION_LIMIT = 500;
const RECOVERY_CODE_TTL_MS = 10 * 60 * 1000;

// Контракт PROJECT.md §4.2–4.3: значения enum'ов согласованы и для товаров, и для заявок
const ITEM_CONDITIONS = ['NEW', 'LIKE_NEW', 'USED', 'NEEDS_REPAIR'];

// Справочник категорий не входит в согласованный контракт (PROJECT.md §2.3) — мок отдаёт
// статичный каталог, чтобы форму заявки можно было заполнить целиком
const CATEGORIES = [
  { id: 'personal', name: 'Личные вещи' },
  { id: 'home', name: 'Для дома и дачи' },
  { id: 'parts', name: 'Запчасти и аксессуары' },
  { id: 'electronics', name: 'Электроника' },
];

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

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function issueToken(userId) {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({ sub: userId, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS }),
  );
  return `${header}.${payload}.mock-signature`;
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

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function publicItem(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    categoryId: item.categoryId ?? null,
    condition: item.condition,
    color: item.color ?? null,
    material: item.material ?? null,
    attributes: item.attributes ?? null,
    image: item.image ?? null,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function publicRequest(request, offeredItem) {
  return {
    id: request.id,
    offeredItemId: request.offeredItemId,
    offeredItem: offeredItem ? publicItem(offeredItem) : null,
    wantedDescription: request.wantedDescription,
    wantedProfile: request.wantedProfile ?? null,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function publicChain(chain) {
  return {
    id: chain.id,
    requestId: chain.requestId,
    length: chain.length,
    successProbability: chain.successProbability,
    selected: chain.selected,
    participants: chain.participants,
  };
}

function toOfferRef(item) {
  return { id: item.id, title: item.title };
}

// Закольцовываем цепочку: владелец хочет товар первого участника, последний участник хочет товар владельца.
function buildParticipants(request, offeredItem, others, usersById, offset, otherCount) {
  const owner = usersById[request.userId];
  const picks = [];
  let cursor = offset;
  while (picks.length < otherCount) {
    const candidate = others[cursor % others.length];
    cursor += 1;
    if (candidate.userId !== request.userId && !picks.some((p) => p.userId === candidate.userId)) {
      picks.push(candidate);
    }
  }

  const participants = [
    {
      userId: owner.id,
      name: owner.name,
      offers: toOfferRef(offeredItem),
      wants: toOfferRef(picks[0]),
    },
  ];
  picks.forEach((pick, i) => {
    participants.push({
      userId: pick.userId,
      name: usersById[pick.userId].name,
      offers: toOfferRef(pick),
      wants: toOfferRef(i === picks.length - 1 ? offeredItem : picks[i + 1]),
    });
  });

  return participants;
}

// Мок-matching: кандидаты — активные товары других пользователей, стартовый берём по первому слову запроса.
function generateChains(db, request) {
  const items = db.get('items').value();
  const users = db.get('users').value();
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  const offeredItem = items.find((i) => i.id === request.offeredItemId);
  if (!offeredItem) return [];

  const others = items.filter((i) => i.userId !== request.userId && i.status === 'ACTIVE');
  if (others.length === 0) return [];

  const wantedWord = request.wantedDescription.toLowerCase().split(/\s+/)[0];
  let matchIndex = others.findIndex((i) => i.title.toLowerCase().includes(wantedWord));
  if (matchIndex === -1) matchIndex = 0;

  const distinctUsers = new Set(others.map((i) => i.userId)).size;
  const probabilities = [90, 72, 55];
  return probabilities
    .slice(0, Math.min(others.length, distinctUsers))
    .map((probability, chainIndex) => ({
      id: randomUUID(),
      requestId: request.id,
      length: chainIndex + 2,
      successProbability: probability,
      selected: false,
      participants: buildParticipants(
        request,
        offeredItem,
        others,
        usersById,
        matchIndex + chainIndex,
        chainIndex + 1,
      ),
      createdAt: new Date().toISOString(),
    }));
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
  if (has('condition')) {
    const condition = String(body.condition);
    if (!ITEM_CONDITIONS.includes(condition)) return { error: 'Неизвестное состояние товара' };
    patch.condition = condition;
  }
  if (has('color')) {
    // пустой/отсутствующий материал фронт шлёт как null — не превращать его в строку "null"
    const color = body.color == null ? '' : String(body.color).trim();
    patch.color = color ? color : null;
  }
  if (has('material')) {
    const material = body.material == null ? '' : String(body.material).trim();
    patch.material = material ? material : null;
  }
  if (has('categoryId')) {
    const categoryId = body.categoryId == null ? '' : String(body.categoryId).trim();
    patch.categoryId = categoryId ? categoryId : null;
  }
  if (has('attributes') && body.attributes && typeof body.attributes === 'object') {
    patch.attributes = body.attributes;
  }

  if (!partial && !patch.title) return { error: 'Название обязательно' };
  if (!partial && !patch.description) return { error: 'Описание обязательно' };
  if (!partial && !patch.condition) return { error: 'Состояние обязательно' };
  return { patch };
}

// wantedProfile — необязательный структурированный фильтр мэтчинга (PROJECT.md §4.3).
// null — фильтр не задан, undefined — ошибка валидации.
function parseWantedProfile(profile) {
  if (profile == null) return null;
  if (typeof profile !== 'object' || Array.isArray(profile)) return undefined;

  const result = {};
  if (profile.categoryId != null) {
    const categoryId = String(profile.categoryId).trim();
    if (!categoryId) return undefined;
    result.categoryId = categoryId;
  }
  if (profile.acceptableCondition != null) {
    if (!Array.isArray(profile.acceptableCondition)) return undefined;
    if (profile.acceptableCondition.length === 0) return undefined;
    if (!profile.acceptableCondition.every((c) => ITEM_CONDITIONS.includes(c))) return undefined;
    result.acceptableCondition = profile.acceptableCondition;
  }
  if (Object.keys(result).length === 0) return null;
  return result;
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

  // Бронь снимается, когда товар больше не держит ни одна заблокированная заявка.
  // Обменянный товар (EXCHANGED) в оборот не возвращаем — сделка уже состоялась.
  const releaseItemIfUnused = (itemId) => {
    const item = findItem(itemId);
    if (!item || item.status !== 'RESERVED') return;

    const stillHeld = db
      .get('exchangeRequests')
      .some((r) => r.offeredItemId === itemId && r.status === 'LOCKED')
      .value();
    if (!stillHeld) db.get('items').updateById(itemId, { status: 'ACTIVE' }).write();
  };
  const findUserByEmail = (email) =>
    db
      .get('users')
      .find((u) => u.email === email)
      .value();

  server.post('/api/v1/account/registration/', (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password || !name) return fail(res, 400, 'email, password и name обязательны');
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Некорректный email');
    if (password.length < 8) return fail(res, 400, 'Пароль должен быть не короче 8 символов');
    if (findUserByEmail(email))
      return fail(res, 409, 'Пользователь с таким email уже зарегистрирован');

    const user = { id: randomUUID(), name, email, createdAt: new Date().toISOString() };
    db.get('users').insert(user).write();
    const passwords = readPasswords(passwordsPath);
    passwords[user.id] = password;
    writePasswords(passwordsPath, passwords);

    res.status(201).json({ token: issueToken(user.id), user: publicUser(user) });
  });

  server.post('/api/v1/account/login/', (req, res) => {
    const { email, password } = req.body ?? {};
    const user = email ? findUserByEmail(email) : undefined;
    // Несуществующий email отличаем от неверного пароля, чтобы фронт показал конкретную ошибку
    if (!user) return fail(res, 404, 'Пользователь с таким email не найден');
    if (readPasswords(passwordsPath)[user.id] !== password) {
      return fail(res, 401, 'Неверный пароль');
    }
    res.json({ token: issueToken(user.id), user: publicUser(user) });
  });

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

  server.get('/api/v1/users/:id', (req, res) => {
    const user = db.get('users').getById(req.params.id).value();
    if (!user) return fail(res, 404, 'Пользователь не найден');
    res.json(publicUser(user));
  });

  server.post('/api/v1/account/password-change/', (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    const user = db.get('users').getById(req.userId).value();
    if (!user) return fail(res, 404, 'Пользователь не найден');

    const passwords = readPasswords(passwordsPath);
    if (passwords[user.id] !== currentPassword) {
      return fail(res, 400, 'Неверный текущий пароль');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return fail(res, 400, 'Пароль должен быть не короче 8 символов');
    }

    passwords[user.id] = newPassword;
    writePasswords(passwordsPath, passwords);
    res.json({ message: 'password_changed' });
  });

  server.get('/api/v1/categories', (req, res) => {
    res.json(CATEGORIES);
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
    // забронированный товар уже участвует в согласуемой цепочке — его нельзя выдернуть из сделки
    if (item.status === 'RESERVED') return fail(res, 409, 'Товар уже участвует в сделке');

    db.get('items').removeById(item.id).write();
    db.get('exchangeRequests')
      .removeWhere((r) => r.offeredItemId === item.id)
      .write();
    res.json({ message: 'archived' });
  });

  server.get('/api/v1/exchange-requests', (req, res) => {
    const requests = db
      .get('exchangeRequests')
      .filter((r) => r.userId === req.userId)
      .value();
    res.json(requests.map((request) => publicRequest(request, findItem(request.offeredItemId))));
  });

  server.get('/api/v1/exchange-requests/:id', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value();
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден');
    res.json(publicRequest(request, findItem(request.offeredItemId)));
  });

  const applyRequestPatch = (request, patch) => {
    db.get('chains')
      .removeWhere((c) => c.requestId === request.id)
      .write();
    db.get('exchangeRequests')
      .updateById(request.id, { ...patch, updatedAt: new Date().toISOString() })
      .write();

    // matching пересчитывается синхронно: нашлись цепочки → IN_PROPOSAL, нет → остаётся в поиске (ACTIVE)
    const chains = generateChains(db, { ...request, ...patch });
    if (chains.length > 0) {
      db.get('chains')
        .push(...chains)
        .write();
      db.get('exchangeRequests').updateById(request.id, { status: 'IN_PROPOSAL' }).write();
    } else {
      db.get('exchangeRequests').updateById(request.id, { status: 'ACTIVE' }).write();
    }
  };

  server.post('/api/v1/exchange-requests', (req, res) => {
    const { offeredItemId, wantedDescription, wantedProfile } = req.body ?? {};
    if (!offeredItemId) return fail(res, 400, 'Нужно выбрать отдаваемый товар');
    const item = findItem(offeredItemId);
    if (!item || item.userId !== req.userId) {
      return fail(res, 400, 'Отдаваемый товар не найден');
    }
    // 409, а не 400: «товар уже в резерве» — отдельный конфликт по PROJECT.md §4.9,
    // фронт показывает на него собственный текст (useRequestForm)
    if (item.status !== 'ACTIVE') return fail(res, 409, 'Товар уже в резерве');
    if (!wantedDescription?.trim()) return fail(res, 400, 'Укажите, что вы хотите получить');
    if (String(wantedDescription).trim().length > DESCRIPTION_LIMIT) {
      return fail(res, 400, `Описание не длиннее ${DESCRIPTION_LIMIT} символов`);
    }
    const profile = parseWantedProfile(wantedProfile);
    if (profile === undefined) return fail(res, 400, 'Некорректный wantedProfile');

    const now = new Date().toISOString();
    const request = {
      id: randomUUID(),
      userId: req.userId,
      offeredItemId,
      wantedDescription: String(wantedDescription).trim(),
      wantedProfile: profile,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    db.get('exchangeRequests').insert(request).write();

    const chains = generateChains(db, request);
    if (chains.length > 0) {
      db.get('chains')
        .push(...chains)
        .write();
      db.get('exchangeRequests').updateById(request.id, { status: 'IN_PROPOSAL' }).write();
      request.status = 'IN_PROPOSAL';
    }

    res.status(201).json({
      request: publicRequest(request, item),
      matching: { createdCandidateChains: chains.length },
    });
  });

  server.patch('/api/v1/exchange-requests/:id', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value();
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден');
    // живая заявка (в поиске или с предложенными цепочками) редактируется, LOCKED/DONE/REMOVED — нет
    if (request.status !== 'ACTIVE' && request.status !== 'IN_PROPOSAL') {
      return fail(res, 400, 'Можно редактировать только активный запрос');
    }

    const patch = {};
    if (req.body?.wantedDescription !== undefined) {
      const description = String(req.body.wantedDescription).trim();
      if (!description) return fail(res, 400, 'Укажите, что вы хотите получить');
      if (description.length > DESCRIPTION_LIMIT) {
        return fail(res, 400, `Описание не длиннее ${DESCRIPTION_LIMIT} символов`);
      }
      patch.wantedDescription = description;
    }
    if (req.body?.wantedProfile !== undefined) {
      const profile = parseWantedProfile(req.body.wantedProfile);
      if (profile === undefined) return fail(res, 400, 'Некорректный wantedProfile');
      patch.wantedProfile = profile;
    }

    applyRequestPatch(request, patch);
    const updated = db.get('exchangeRequests').getById(request.id).value();
    res.json(publicRequest(updated, findItem(updated.offeredItemId)));
  });

  // Деактивация заявки — мягкая: статус REMOVED, заявка остаётся в списке (PROJECT.md §2.5 «Отменён»)
  server.delete('/api/v1/exchange-requests/:id', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value();
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден');

    db.get('exchangeRequests')
      .updateById(request.id, { status: 'REMOVED', updatedAt: new Date().toISOString() })
      .write();
    // у отменённой заявки нет больше кандидатных цепочек
    db.get('chains')
      .removeWhere((c) => c.requestId === request.id)
      .write();
    releaseItemIfUnused(request.offeredItemId);
    res.json({ message: 'deleted' });
  });

  server.get('/api/v1/exchange-requests/:id/chains', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value();
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден');

    const chains = db
      .get('chains')
      .filter((c) => c.requestId === request.id)
      .value()
      .sort((a, b) => b.successProbability - a.successProbability);
    res.json(chains.map(publicChain));
  });

  // Выбор цепочки блокирует заявку: дальше согласование участников без правок условий (PROJECT.md §4.4)
  server.post('/api/v1/chains/:chainId/select', (req, res) => {
    const chain = db.get('chains').getById(req.params.chainId).value();
    if (!chain) return fail(res, 404, 'Цепочка не найдена');
    const request = db.get('exchangeRequests').getById(chain.requestId).value();
    if (!request || request.userId !== req.userId) return fail(res, 403, 'Вы не участник цепочки');
    if (request.status !== 'ACTIVE' && request.status !== 'IN_PROPOSAL') {
      return fail(res, 409, 'Заявка уже в финальном статусе');
    }

    db.get('chains').updateById(chain.id, { selected: true }).write();
    db.get('exchangeRequests').updateById(chain.requestId, { status: 'LOCKED' }).write();
    // выбор цепочки резервирует участие товара в ней на время согласования (PROJECT.md §1)
    db.get('items').updateById(request.offeredItemId, { status: 'RESERVED' }).write();
    res.json({ id: chain.id, selected: true });
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
