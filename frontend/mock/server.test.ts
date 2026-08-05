// @vitest-environment node
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createMockApp } from './server.js'

const mockDir = dirname(fileURLToPath(import.meta.url))

const DEMO_EMAIL = 'anna@example.com'
const DEMO_PASSWORD = 'demo1234'
const REQUEST_ID = '20000000-0000-4000-8000-000000000001'

let server: Server
let baseUrl: string
let token: string
let tmpDir: string

function authHeaders(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, ...extra }
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, init)
  const body = await response.json()
  return { status: response.status, body }
}

function postJson(path: string, payload: unknown, useAuth = true) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(useAuth ? authHeaders() : {}) },
    body: JSON.stringify(payload),
  })
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tricky-mock-test-'))
  const dbPath = join(tmpDir, 'db.json')
  const passwordsPath = join(tmpDir, 'passwords.json')
  copyFileSync(join(mockDir, 'db.json'), dbPath)
  copyFileSync(join(mockDir, 'passwords.json'), passwordsPath)

  const app = createMockApp({ dbPath, passwordsPath })
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Не удалось определить порт мок-сервера')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  )
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('authorization', () => {
  it('registration creates a user and returns a token', async () => {
    const { status, body } = await postJson(
      '/account/registration/',
      {
        email: 'new@example.com',
        password: 'password123',
        name: 'Новый пользователь',
      },
      false,
    )

    expect(status).toBe(201)
    expect(body.token).toEqual(expect.any(String))
    expect(body.user).toMatchObject({ email: 'new@example.com', name: 'Новый пользователь' })
  })

  it('rejects duplicate registration', async () => {
    const { status, body } = await postJson(
      '/account/registration/',
      {
        email: DEMO_EMAIL,
        password: 'password123',
        name: 'Дубль',
      },
      false,
    )

    expect(status).toBe(409)
    expect(body).toMatchObject({ error: expect.any(String), code: 409 })
  })

  it('rejects invalid credentials', async () => {
    const { status } = await postJson(
      '/account/login/',
      { email: DEMO_EMAIL, password: 'wrong-password' },
      false,
    )
    expect(status).toBe(401)
  })

  it('logs in and issues a token for the demo user', async () => {
    const { status, body } = await postJson(
      '/account/login/',
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      false,
    )

    expect(status).toBe(200)
    expect(body.user.email).toBe(DEMO_EMAIL)
    token = body.token
  })

  it('rejects protected routes without a token', async () => {
    const { status, body } = await request('/products')
    expect(status).toBe(401)
    expect(body).toMatchObject({ error: expect.any(String), code: 401 })
  })

  it('rejects an expired token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({ sub: 'some-user-id', iat: Date.now() - 1000, exp: Date.now() - 500 }),
    ).toString('base64url')
    const expiredToken = `${header}.${payload}.mock-signature`

    const { status } = await request('/products', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    })
    expect(status).toBe(401)
  })
})

describe('password recovery', () => {
  it('sends a recovery code for a registered email', async () => {
    const { status, body } = await postJson(
      '/account/password-recovery/send-code/',
      { email: DEMO_EMAIL },
      false,
    )

    expect(status).toBe(200)
    expect(body.message).toBe('code_sent')
    expect(body.code).toMatch(/^\d{6}$/)
  })

  it('rejects an unregistered email', async () => {
    const { status, body } = await postJson(
      '/account/password-recovery/send-code/',
      { email: 'ghost@example.com' },
      false,
    )

    expect(status).toBe(404)
    expect(body.code).toBe(404)
  })

  it('rejects an unknown code', async () => {
    await postJson('/account/password-recovery/send-code/', { email: DEMO_EMAIL }, false)

    const { status } = await postJson(
      '/account/password-recovery/verify-code/',
      { email: DEMO_EMAIL, code: '000000' },
      false,
    )
    expect(status).toBe(400)
  })

  it('completes the flow and lets the user log in with the new password', async () => {
    const { body: sent } = await postJson(
      '/account/password-recovery/send-code/',
      { email: DEMO_EMAIL },
      false,
    )

    const verify = await postJson(
      '/account/password-recovery/verify-code/',
      { email: DEMO_EMAIL, code: sent.code },
      false,
    )
    expect(verify.status).toBe(200)
    expect(verify.body).toEqual({ message: 'code_valid' })

    const reset = await postJson(
      '/account/password-recovery/reset-password/',
      { email: DEMO_EMAIL, code: sent.code, password: 'new-password-123' },
      false,
    )
    expect(reset.status).toBe(200)
    expect(reset.body).toEqual({ message: 'password_changed' })

    const login = await postJson(
      '/account/login/',
      { email: DEMO_EMAIL, password: 'new-password-123' },
      false,
    )
    expect(login.status).toBe(200)

    const oldLogin = await postJson(
      '/account/login/',
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      false,
    )
    expect(oldLogin.status).toBe(401)
  })

  it('rejects a too-short new password', async () => {
    const { body: sent } = await postJson(
      '/account/password-recovery/send-code/',
      { email: DEMO_EMAIL },
      false,
    )

    const { status } = await postJson(
      '/account/password-recovery/reset-password/',
      { email: DEMO_EMAIL, code: sent.code, password: 'short' },
      false,
    )
    expect(status).toBe(400)
  })
})

describe('products', () => {
  it('lists only the current user products', async () => {
    const { status, body } = await request('/products', { headers: authHeaders() })

    expect(status).toBe(200)
    expect(body).toHaveLength(2)
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      image: expect.any(String),
      status: 'active',
    })
  })

  it('creates a product with an uploaded image', async () => {
    const form = new FormData()
    form.append('title', 'Смарт-часы')
    form.append('description', 'Работают как новые')
    form.append('image', new Blob(['fake-bytes'], { type: 'image/png' }), 'watch.png')

    const { status, body } = await request('/products', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    })

    expect(status).toBe(201)
    expect(body).toMatchObject({ title: 'Смарт-часы', status: 'active' })
    expect(body.image).toMatch(/^data:image\/png;base64,/)
  })

  it('requires an image on creation', async () => {
    const form = new FormData()
    form.append('title', 'Без фото')
    form.append('description', 'Описание')

    const { status, body } = await request('/products', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    })

    expect(status).toBe(400)
    expect(body.code).toBe(400)
  })

  it('patches a product partially', async () => {
    const { body: product } = await request('/products', { headers: authHeaders() })
    const id = product[0].id

    const { status, body } = await request(`/products/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'Новое название' }),
    })

    expect(status).toBe(200)
    expect(body).toMatchObject({ id, title: 'Новое название', status: 'active' })
  })

  it('returns 404 for a foreign product', async () => {
    const { status, body } = await request('/products/10000000-0000-4000-8000-000000000003', {
      headers: authHeaders(),
    })
    expect(status).toBe(404)
    expect(body.code).toBe(404)
  })
})

describe('exchange requests', () => {
  it('lists requests with the offered item populated', async () => {
    const { status, body } = await request('/exchange-requests', { headers: authHeaders() })

    expect(status).toBe(200)
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      offeredItem: { id: expect.any(String), title: expect.any(String) },
      wantedDescription: expect.any(String),
      status: 'active',
    })
  })

  it('creates a request', async () => {
    const { body: products } = await request('/products', { headers: authHeaders() })
    const productId = products[0].id

    const { status, body } = await postJson('/exchange-requests', {
      offeredItemId: productId,
      wantedDescription: 'Наушники',
      wantedState: 'Б/у',
    })

    expect(status).toBe(201)
    expect(body).toMatchObject({
      offeredItemId: productId,
      wantedDescription: 'Наушники',
      wantedState: 'Б/у',
      status: 'active',
    })
  })

  it('cancels a request and blocks further edits', async () => {
    const { body: products } = await request('/products', { headers: authHeaders() })
    const { body: created } = await postJson('/exchange-requests', {
      offeredItemId: products[0].id,
      wantedDescription: 'Книга',
    })

    const cancel = await postJson(`/exchange-requests/${created.id}/cancel`, {})
    expect(cancel.status).toBe(200)
    expect(cancel.body).toEqual({ message: 'cancelled' })

    const patch = await request(`/exchange-requests/${created.id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ wantedDescription: 'Что-то ещё' }),
    })
    expect(patch.status).toBe(400)
  })
})

describe('chains', () => {
  it('generates chains once and sorts them by probability descending', async () => {
    const first = await request(`/exchange-requests/${REQUEST_ID}/chains`, {
      headers: authHeaders(),
    })
    const second = await request(`/exchange-requests/${REQUEST_ID}/chains`, {
      headers: authHeaders(),
    })

    expect(first.status).toBe(200)
    expect(first.body.length).toBeGreaterThan(0)
    expect(first.body.map((c: { id: string }) => c.id)).toEqual(
      second.body.map((c: { id: string }) => c.id),
    )

    const probabilities = first.body.map(
      (c: { successProbability: number }) => c.successProbability,
    )
    expect(probabilities).toEqual([...probabilities].sort((a, b) => b - a))

    const chain = first.body[0]
    expect(chain).toMatchObject({
      id: expect.any(String),
      length: expect.any(Number),
      successProbability: expect.any(Number),
      selected: false,
      participants: expect.any(Array),
    })
    expect(chain.participants[0]).toMatchObject({
      userId: expect.any(String),
      name: expect.any(String),
      offers: { id: expect.any(String), title: expect.any(String) },
      wants: { id: expect.any(String), title: expect.any(String) },
    })
  })

  it('selects and deselects a chain', async () => {
    const { body: chains } = await request(`/exchange-requests/${REQUEST_ID}/chains`, {
      headers: authHeaders(),
    })
    const chainId = chains[0].id

    const select = await postJson(`/exchange-requests/${REQUEST_ID}/chains/${chainId}/select`, {})
    expect(select.status).toBe(200)
    expect(select.body).toEqual({ id: chainId, selected: true })

    const deselect = await postJson(
      `/exchange-requests/${REQUEST_ID}/chains/${chainId}/deselect`,
      {},
    )
    expect(deselect.status).toBe(200)
    expect(deselect.body).toEqual({ id: chainId, selected: false })
  })
})
