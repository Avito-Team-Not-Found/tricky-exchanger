import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import jsonServer from 'json-server'
import multer from 'multer'

const here = dirname(fileURLToPath(import.meta.url))

const DEFAULT_PORT = 4000
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const PRODUCT_TITLE_LIMIT = 100
const PRODUCT_DESCRIPTION_LIMIT = 500

function readPasswords(passwordsPath) {
  try {
    return JSON.parse(readFileSync(passwordsPath, 'utf8'))
  } catch {
    return {}
  }
}

function writePasswords(passwordsPath, passwords) {
  writeFileSync(passwordsPath, JSON.stringify(passwords, null, 2) + '\n')
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function issueToken(userId) {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = toBase64Url(
    JSON.stringify({ sub: userId, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS }),
  )
  return `${header}.${payload}.mock-signature`
}

function decodeToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    if (typeof payload.sub !== 'string') return null
    if (typeof payload.exp !== 'number' || Date.now() >= payload.exp) return null
    return payload.sub
  } catch {
    return null
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email }
}

function publicProduct(product) {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    image: product.image ?? null,
    status: product.status,
  }
}

function publicRequest(request, offeredItem) {
  return {
    id: request.id,
    offeredItemId: request.offeredItemId,
    offeredItem,
    wantedDescription: request.wantedDescription,
    wantedState: request.wantedState,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  }
}

function publicChain(chain) {
  return {
    id: chain.id,
    length: chain.length,
    successProbability: chain.successProbability,
    selected: chain.selected,
    participants: chain.participants,
  }
}

function toOfferRef(product) {
  return { id: product.id, title: product.title }
}

// Закольцовываем цепочку: владелец хочет товар первого участника, последний участник хочет товар владельца.
function buildParticipants(request, offeredProduct, others, usersById, offset, otherCount) {
  const owner = usersById[request.userId]
  const picks = []
  let cursor = offset
  while (picks.length < otherCount) {
    const candidate = others[cursor % others.length]
    cursor += 1
    if (candidate.userId !== request.userId && !picks.some((p) => p.userId === candidate.userId)) {
      picks.push(candidate)
    }
  }

  const participants = [
    {
      userId: owner.id,
      name: owner.name,
      offers: toOfferRef(offeredProduct),
      wants: toOfferRef(picks[0]),
    },
  ]
  picks.forEach((pick, i) => {
    participants.push({
      userId: pick.userId,
      name: usersById[pick.userId].name,
      offers: toOfferRef(pick),
      wants: toOfferRef(i === picks.length - 1 ? offeredProduct : picks[i + 1]),
    })
  })

  return participants
}

function generateChains(db, request) {
  const products = db.get('products').value()
  const users = db.get('users').value()
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]))
  const offeredProduct = products.find((p) => p.id === request.offeredItemId)
  if (!offeredProduct) return []

  // Мок-кандидаты — активные товары других пользователей; стартовый берём по первому слову запроса.
  const others = products.filter((p) => p.userId !== request.userId && p.status === 'active')
  if (others.length === 0) return []

  const wantedWord = request.wantedDescription.toLowerCase().split(/\s+/)[0]
  let matchIndex = others.findIndex((p) => p.title.toLowerCase().includes(wantedWord))
  if (matchIndex === -1) matchIndex = 0

  const distinctUsers = new Set(others.map((p) => p.userId)).size
  const probabilities = [90, 72, 55]
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
        offeredProduct,
        others,
        usersById,
        matchIndex + chainIndex,
        chainIndex + 1,
      ),
      createdAt: new Date().toISOString(),
    }))
}

export function createMockApp({
  dbPath = join(here, 'db.json'),
  passwordsPath = join(here, 'passwords.json'),
} = {}) {
  const server = jsonServer.create()
  const router = jsonServer.router(dbPath)
  const db = router.db
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

  server.use(jsonServer.defaults())
  server.use(jsonServer.bodyParser)

  const fail = (res, code, message) => res.status(code).json({ error: message, code })
  const findProduct = (productId) => db.get('products').getById(productId).value()
  const findUserByEmail = (email) =>
    db
      .get('users')
      .find((u) => u.email === email)
      .value()

  server.post('/api/v1/account/registration/', (req, res) => {
    const { email, password, name } = req.body ?? {}
    if (!email || !password || !name) return fail(res, 400, 'email, password и name обязательны')
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Некорректный email')
    if (password.length < 8) return fail(res, 400, 'Пароль должен быть не короче 8 символов')
    if (findUserByEmail(email))
      return fail(res, 409, 'Пользователь с таким email уже зарегистрирован')

    const user = { id: randomUUID(), name, email, createdAt: new Date().toISOString() }
    db.get('users').insert(user).write()
    const passwords = readPasswords(passwordsPath)
    passwords[user.id] = password
    writePasswords(passwordsPath, passwords)

    res.status(201).json({ token: issueToken(user.id), user: publicUser(user) })
  })

  server.post('/api/v1/account/login/', (req, res) => {
    const { email, password } = req.body ?? {}
    const user = email ? findUserByEmail(email) : undefined
    if (!user || readPasswords(passwordsPath)[user.id] !== password) {
      return fail(res, 401, 'Неверный email или пароль')
    }
    res.json({ token: issueToken(user.id), user: publicUser(user) })
  })

  server.use('/api/v1', (req, res, next) => {
    const auth = req.headers.authorization ?? ''
    const userId = decodeToken(auth.replace(/^Bearer\s+/i, ''))
    if (!userId) return fail(res, 401, 'Требуется авторизация')
    req.userId = userId
    next()
  })

  server.get('/api/v1/users/:id', (req, res) => {
    const user = db.get('users').getById(req.params.id).value()
    if (!user) return fail(res, 404, 'Пользователь не найден')
    res.json(publicUser(user))
  })

  server.get('/api/v1/products', (req, res) => {
    const products = db
      .get('products')
      .filter((p) => p.userId === req.userId)
      .value()
    res.json(products.map(publicProduct))
  })

  server.get('/api/v1/products/:id', (req, res) => {
    const product = findProduct(req.params.id)
    if (!product || product.userId !== req.userId) return fail(res, 404, 'Товар не найден')
    res.json(publicProduct(product))
  })

  const toImageDataUri = (file) =>
    file ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}` : null

  server.post('/api/v1/products', upload.single('image'), (req, res) => {
    const title = req.body?.title?.trim()
    const description = req.body?.description?.trim()
    if (!title) return fail(res, 400, 'Название обязательно')
    if (!description) return fail(res, 400, 'Описание обязательно')
    if (title.length > PRODUCT_TITLE_LIMIT)
      return fail(res, 400, `Название не длиннее ${PRODUCT_TITLE_LIMIT} символов`)
    if (description.length > PRODUCT_DESCRIPTION_LIMIT) {
      return fail(res, 400, `Описание не длиннее ${PRODUCT_DESCRIPTION_LIMIT} символов`)
    }
    if (!req.file) return fail(res, 400, 'Нужно загрузить фото товара')

    const now = new Date().toISOString()
    const product = {
      id: randomUUID(),
      userId: req.userId,
      title,
      description,
      image: toImageDataUri(req.file),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    db.get('products').insert(product).write()
    res.status(201).json(publicProduct(product))
  })

  server.patch('/api/v1/products/:id', upload.single('image'), (req, res) => {
    const product = findProduct(req.params.id)
    if (!product || product.userId !== req.userId) return fail(res, 404, 'Товар не найден')

    const patch = {}
    if (req.body?.title !== undefined) {
      const title = req.body.title.trim()
      if (!title) return fail(res, 400, 'Название обязательно')
      if (title.length > PRODUCT_TITLE_LIMIT)
        return fail(res, 400, `Название не длиннее ${PRODUCT_TITLE_LIMIT} символов`)
      patch.title = title
    }
    if (req.body?.description !== undefined) {
      const description = req.body.description.trim()
      if (!description) return fail(res, 400, 'Описание обязательно')
      if (description.length > PRODUCT_DESCRIPTION_LIMIT) {
        return fail(res, 400, `Описание не длиннее ${PRODUCT_DESCRIPTION_LIMIT} символов`)
      }
      patch.description = description
    }
    if (req.file) {
      patch.image = toImageDataUri(req.file)
    } else if (req.body?.image === null) {
      patch.image = null
    }

    db.get('products')
      .updateById(product.id, { ...patch, updatedAt: new Date().toISOString() })
      .write()
    res.json(publicProduct(findProduct(product.id)))
  })

  server.delete('/api/v1/products/:id', (req, res) => {
    const product = findProduct(req.params.id)
    if (!product || product.userId !== req.userId) return fail(res, 404, 'Товар не найден')

    db.get('products').removeById(product.id).write()
    db.get('exchangeRequests')
      .removeWhere((r) => r.offeredItemId === product.id)
      .write()
    res.json({ message: 'deleted' })
  })

  server.get('/api/v1/exchange-requests', (req, res) => {
    const requests = db
      .get('exchangeRequests')
      .filter((r) => r.userId === req.userId)
      .value()
    res.json(
      requests.map((request) => {
        const offeredItem = findProduct(request.offeredItemId)
        return {
          id: request.id,
          offeredItem: offeredItem ? publicProduct(offeredItem) : null,
          wantedDescription: request.wantedDescription,
          status: request.status,
        }
      }),
    )
  })

  server.get('/api/v1/exchange-requests/:id', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value()
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден')
    const offeredItem = findProduct(request.offeredItemId)
    res.json(publicRequest(request, offeredItem ? publicProduct(offeredItem) : null))
  })

  server.post('/api/v1/exchange-requests', (req, res) => {
    const { offeredItemId, wantedDescription, wantedState } = req.body ?? {}
    if (!offeredItemId) return fail(res, 400, 'Нужно выбрать отдаваемый товар')
    if (!wantedDescription?.trim()) return fail(res, 400, 'Укажите название желаемого товара')
    const product = findProduct(offeredItemId)
    if (!product || product.userId !== req.userId)
      return fail(res, 400, 'Отдаваемый товар не найден')

    const now = new Date().toISOString()
    const request = {
      id: randomUUID(),
      userId: req.userId,
      offeredItemId,
      wantedDescription: wantedDescription.trim(),
      wantedState: wantedState ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    db.get('exchangeRequests').insert(request).write()
    res.status(201).json(publicRequest(request, publicProduct(product)))
  })

  server.patch('/api/v1/exchange-requests/:id', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value()
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден')
    if (request.status !== 'active')
      return fail(res, 400, 'Можно редактировать только активный запрос')

    const patch = {}
    if (req.body?.wantedDescription !== undefined) {
      if (!req.body.wantedDescription.trim())
        return fail(res, 400, 'Укажите название желаемого товара')
      patch.wantedDescription = req.body.wantedDescription.trim()
    }
    if (req.body?.wantedState !== undefined) patch.wantedState = req.body.wantedState

    db.get('exchangeRequests')
      .updateById(request.id, { ...patch, updatedAt: new Date().toISOString() })
      .write()
    const updated = db.get('exchangeRequests').getById(request.id).value()
    const offeredItem = findProduct(updated.offeredItemId)
    res.json(publicRequest(updated, offeredItem ? publicProduct(offeredItem) : null))
  })

  server.delete('/api/v1/exchange-requests/:id', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value()
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден')

    db.get('exchangeRequests').removeById(request.id).write()
    db.get('chains')
      .removeWhere((c) => c.requestId === request.id)
      .write()
    res.json({ message: 'deleted' })
  })

  server.post('/api/v1/exchange-requests/:id/cancel', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value()
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден')
    if (request.status !== 'active') return fail(res, 400, 'Можно отменить только активный запрос')

    db.get('exchangeRequests')
      .updateById(request.id, { status: 'cancelled', updatedAt: new Date().toISOString() })
      .write()
    res.json({ message: 'cancelled' })
  })

  server.get('/api/v1/exchange-requests/:id/chains', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value()
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден')

    // Цепочки генерируются один раз и сохраняются, чтобы выбор переживал перезагрузку (PROJECT.md §4.4).
    let chains = db
      .get('chains')
      .filter((c) => c.requestId === request.id)
      .value()
    if (chains.length === 0) {
      chains = generateChains(db, request)
      db.get('chains')
        .push(...chains)
        .write()
    }

    chains.sort((a, b) => b.successProbability - a.successProbability)
    res.json(chains.map(publicChain))
  })

  server.post('/api/v1/exchange-requests/:id/chains/:chainId/select', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value()
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден')
    const chain = db
      .get('chains')
      .find((c) => c.id === req.params.chainId && c.requestId === req.params.id)
      .value()
    if (!chain) return fail(res, 404, 'Цепочка не найдена')

    db.get('chains').updateById(chain.id, { selected: true }).write()
    res.json({ id: chain.id, selected: true })
  })

  server.post('/api/v1/exchange-requests/:id/chains/:chainId/deselect', (req, res) => {
    const request = db.get('exchangeRequests').getById(req.params.id).value()
    if (!request || request.userId !== req.userId) return fail(res, 404, 'Запрос не найден')
    const chain = db
      .get('chains')
      .find((c) => c.id === req.params.chainId && c.requestId === req.params.id)
      .value()
    if (!chain) return fail(res, 404, 'Цепочка не найдена')

    db.get('chains').updateById(chain.id, { selected: false }).write()
    res.json({ id: chain.id, selected: false })
  })

  server.use('/api/v1', (req, res) => fail(res, 404, 'Эндпоинт не найден'))

  server.use((err, req, res, next) => {
    if (res.headersSent) return next(err)
    if (err?.code === 'LIMIT_FILE_SIZE') return fail(res, 400, 'Файл не больше 5 МБ')
    const code = Number.isInteger(err?.status) ? err.status : 500
    fail(res, code, err?.message ?? 'Внутренняя ошибка сервера')
  })

  return server
}

export function startMockServer(port = DEFAULT_PORT) {
  return createMockApp().listen(port, () => {
    console.log(`Mock API: http://localhost:${port}/api/v1`)
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMockServer(Number(process.env.MOCK_PORT) || DEFAULT_PORT)
}
