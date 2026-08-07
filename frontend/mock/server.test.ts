// @vitest-environment node
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMockApp } from './server.js';

const mockDir = dirname(fileURLToPath(import.meta.url));

const DEMO_EMAIL = 'anna@example.com';
const DEMO_PASSWORD = 'demo1234';
const LOCKED_REQUEST_ID = '20000000-0000-4000-8000-000000000003';
const FOREIGN_ITEM_ID = '20000000-0000-4000-8000-000000000001';
const RESERVED_ITEM_ID = '10000000-0000-4000-8000-000000000003';

let server: Server;
let baseUrl: string;
let token: string;
let tmpDir: string;

function authHeaders(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, init);
  // тела ответов мока динамические — тесты читают произвольные поля, типизировать каждое незачем
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await response.json()) as any;
  return { status: response.status, body };
}

function postJson(path: string, payload: unknown, useAuth = true) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(useAuth ? authHeaders() : {}) },
    body: JSON.stringify(payload),
  });
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tricky-mock-test-'));
  const dbPath = join(tmpDir, 'db.json');
  const passwordsPath = join(tmpDir, 'passwords.json');
  copyFileSync(join(mockDir, 'db.json'), dbPath);
  copyFileSync(join(mockDir, 'passwords.json'), passwordsPath);

  const app = createMockApp({ dbPath, passwordsPath });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));

  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Не удалось определить порт мок-сервера');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  rmSync(tmpDir, { recursive: true, force: true });
});

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
    );

    expect(status).toBe(201);
    expect(body.token).toEqual(expect.any(String));
    expect(body.user).toMatchObject({ email: 'new@example.com', name: 'Новый пользователь' });
  });

  it('rejects duplicate registration', async () => {
    const { status, body } = await postJson(
      '/account/registration/',
      {
        email: DEMO_EMAIL,
        password: 'password123',
        name: 'Дубль',
      },
      false,
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ error: expect.any(String), code: 409 });
  });

  it('rejects invalid credentials', async () => {
    const { status } = await postJson(
      '/account/login/',
      { email: DEMO_EMAIL, password: 'wrong-password' },
      false,
    );
    expect(status).toBe(401);
  });

  it('returns 404 for an unregistered email', async () => {
    const { status, body } = await postJson(
      '/account/login/',
      { email: 'ghost@example.com', password: 'whatever123' },
      false,
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({ error: expect.any(String), code: 404 });
  });

  it('logs in and issues a token for the demo user', async () => {
    const { status, body } = await postJson(
      '/account/login/',
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      false,
    );

    expect(status).toBe(200);
    expect(body.user.email).toBe(DEMO_EMAIL);
    token = body.token;
  });

  it('rejects protected routes without a token', async () => {
    const { status, body } = await request('/items');
    expect(status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String), code: 401 });
  });

  it('rejects an expired token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'some-user-id', iat: Date.now() - 1000, exp: Date.now() - 500 }),
    ).toString('base64url');
    const expiredToken = `${header}.${payload}.mock-signature`;

    const { status } = await request('/items', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(status).toBe(401);
  });
});

describe('password recovery', () => {
  it('sends a recovery code for a registered email', async () => {
    const { status, body } = await postJson(
      '/account/password-recovery/send-code/',
      { email: DEMO_EMAIL },
      false,
    );

    expect(status).toBe(200);
    expect(body.message).toBe('code_sent');
    expect(body.code).toMatch(/^\d{6}$/);
  });

  it('rejects an unregistered email', async () => {
    const { status, body } = await postJson(
      '/account/password-recovery/send-code/',
      { email: 'ghost@example.com' },
      false,
    );

    expect(status).toBe(404);
    expect(body.code).toBe(404);
  });

  it('rejects an unknown code', async () => {
    await postJson('/account/password-recovery/send-code/', { email: DEMO_EMAIL }, false);

    const { status } = await postJson(
      '/account/password-recovery/verify-code/',
      { email: DEMO_EMAIL, code: '000000' },
      false,
    );
    expect(status).toBe(400);
  });

  it('completes the flow and lets the user log in with the new password', async () => {
    const { body: sent } = await postJson(
      '/account/password-recovery/send-code/',
      { email: DEMO_EMAIL },
      false,
    );

    const verify = await postJson(
      '/account/password-recovery/verify-code/',
      { email: DEMO_EMAIL, code: sent.code },
      false,
    );
    expect(verify.status).toBe(200);
    expect(verify.body).toEqual({ message: 'code_valid' });

    const reset = await postJson(
      '/account/password-recovery/reset-password/',
      { email: DEMO_EMAIL, code: sent.code, password: 'new-password-123' },
      false,
    );
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ message: 'password_changed' });

    const login = await postJson(
      '/account/login/',
      { email: DEMO_EMAIL, password: 'new-password-123' },
      false,
    );
    expect(login.status).toBe(200);

    const oldLogin = await postJson(
      '/account/login/',
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      false,
    );
    expect(oldLogin.status).toBe(401);
  });

  it('rejects a too-short new password', async () => {
    const { body: sent } = await postJson(
      '/account/password-recovery/send-code/',
      { email: DEMO_EMAIL },
      false,
    );

    const { status } = await postJson(
      '/account/password-recovery/reset-password/',
      { email: DEMO_EMAIL, code: sent.code, password: 'short' },
      false,
    );
    expect(status).toBe(400);
  });
});

describe('password change', () => {
  const PWD_EMAIL = 'password-change@example.com';
  const PWD = 'original-pass-123';
  let pwdToken: string;

  beforeAll(async () => {
    const { body } = await postJson(
      '/account/registration/',
      { email: PWD_EMAIL, password: PWD, name: 'Проверка смены пароля' },
      false,
    );
    pwdToken = body.token;
  });

  it('rejects password change without a token', async () => {
    const { status, body } = await request('/account/password-change/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: PWD, newPassword: 'new-password-123' }),
    });
    expect(status).toBe(401);
    expect(body).toMatchObject({ error: expect.any(String), code: 401 });
  });

  it('rejects a wrong current password', async () => {
    const { status, body } = await request('/account/password-change/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pwdToken}` },
      body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'new-password-123' }),
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: expect.any(String), code: 400 });
  });

  it('rejects a too-short new password', async () => {
    const { status } = await request('/account/password-change/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pwdToken}` },
      body: JSON.stringify({ currentPassword: PWD, newPassword: 'short' }),
    });
    expect(status).toBe(400);
  });

  it('changes the password and lets the user log in with the new one', async () => {
    const { status, body } = await request('/account/password-change/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pwdToken}` },
      body: JSON.stringify({ currentPassword: PWD, newPassword: 'new-password-123' }),
    });

    expect(status).toBe(200);
    expect(body).toEqual({ message: 'password_changed' });

    const login = await postJson(
      '/account/login/',
      { email: PWD_EMAIL, password: 'new-password-123' },
      false,
    );
    expect(login.status).toBe(200);

    const oldLogin = await postJson('/account/login/', { email: PWD_EMAIL, password: PWD }, false);
    expect(oldLogin.status).toBe(401);
  });
});

describe('categories', () => {
  it('returns the category catalog', async () => {
    const { status, body } = await request('/categories', { headers: authHeaders() });

    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });
  });
});

describe('items', () => {
  it('lists only the current user items', async () => {
    const { status, body } = await request('/items', { headers: authHeaders() });

    expect(status).toBe(200);
    expect(body).toHaveLength(4);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      image: expect.any(String),
      status: 'ACTIVE',
    });
  });

  it('creates an item with an uploaded image and all fields', async () => {
    const form = new FormData();
    form.append('title', 'Смарт-часы');
    form.append('description', 'Работают как новые');
    form.append('color', 'black');
    form.append('material', '');
    form.append('image', new Blob(['fake-bytes'], { type: 'image/png' }), 'watch.png');

    const { status, body } = await request('/items', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });

    expect(status).toBe(201);
    expect(body).toMatchObject({
      title: 'Смарт-часы',
      color: 'black',
      material: null,
      status: 'ACTIVE',
    });
    expect(body.image).toMatch(/^data:image\/png;base64,/);
  });

  it('requires an image on creation', async () => {
    const form = new FormData();
    form.append('title', 'Без фото');
    form.append('description', 'Описание');

    const { status, body } = await request('/items', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });

    expect(status).toBe(400);
    expect(body.code).toBe(400);
  });

  it('patches color and material', async () => {
    const { body: items } = await request('/items', { headers: authHeaders() });
    const id = items[0].id;

    const { status, body } = await request(`/items/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ color: 'red', material: 'aluminum' }),
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ id, color: 'red', material: 'aluminum' });
  });

  // multipart не умеет null: очистка едет пустой строкой. Без этого очистка цвета терялась,
  // когда пользователь заодно менял фото и запрос уходил как multipart
  it('clears color through multipart when the photo is replaced too', async () => {
    const { body: items } = await request('/items', { headers: authHeaders() });
    const id = items[0].id;
    await request(`/items/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ color: 'white', material: 'plastic' }),
    });

    const form = new FormData();
    form.append('title', 'Товар без цвета');
    form.append('description', 'Описание');
    form.append('color', '');
    form.append('material', '');
    form.append('image', new Blob(['fake-bytes'], { type: 'image/png' }), 'x.png');

    const { status, body } = await request(`/items/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: form,
    });

    expect(status).toBe(200);
    expect(body.color).toBeNull();
    expect(body.material).toBeNull();
    expect(body.image).toMatch(/^data:image\/png;base64,/);
  });

  it('refuses to archive a reserved item', async () => {
    const { status, body } = await request(`/items/${RESERVED_ITEM_ID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 409 });
  });

  it('stores an empty material as null, not the string "null"', async () => {
    const { body: items } = await request('/items', { headers: authHeaders() });
    const id = items[0].id;

    const { status, body } = await request(`/items/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ material: null, color: null }),
    });

    expect(status).toBe(200);
    expect(body.material).toBeNull();
    expect(body.color).toBeNull();
  });

  it('returns 404 for a foreign item', async () => {
    const { status, body } = await request(`/items/${FOREIGN_ITEM_ID}`, {
      headers: authHeaders(),
    });
    expect(status).toBe(404);
    expect(body.code).toBe(404);
  });

  it('archives an item', async () => {
    // архив — на свежесозданном товаре, чтобы каскадное удаление заявок не задело фикстуру
    const form = new FormData();
    form.append('title', 'Товар на удаление');
    form.append('description', 'Проверяем архивирование');
    form.append('image', new Blob(['fake-bytes'], { type: 'image/png' }), 'x.png');
    const { body: created } = await request('/items', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });

    const { status, body } = await request(`/items/${created.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(status).toBe(200);
    expect(body).toEqual({ message: 'archived' });

    const after = await request('/items', { headers: authHeaders() });
    expect(after.body.some((i: { id: string }) => i.id === created.id)).toBe(false);
  });
});

describe('exchange requests', () => {
  it('lists requests with the offered item populated', async () => {
    const { status, body } = await request('/exchange-requests', { headers: authHeaders() });

    expect(status).toBe(200);
    expect(body).toHaveLength(5);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      offeredItem: { id: expect.any(String), title: expect.any(String) },
      wantedDescription: expect.any(String),
      status: expect.any(String),
    });
  });

  it('creates a request, runs matching and returns the result', async () => {
    const { body: items } = await request('/items', { headers: authHeaders() });
    const itemId = items.find((i: { status: string }) => i.status === 'ACTIVE').id;

    const { status, body } = await postJson('/exchange-requests', {
      offeredItemId: itemId,
      wantedDescription: 'Наушники с шумоподавлением',
      wantedProfile: { categoryId: 'electronics' },
    });

    expect(status).toBe(201);
    expect(body.matching.createdCandidateChains).toBeGreaterThan(0);
    // нашлись цепочки → заявка переходит в IN_PROPOSAL
    expect(body.request).toMatchObject({
      offeredItemId: itemId,
      wantedDescription: 'Наушники с шумоподавлением',
      wantedProfile: { categoryId: 'electronics' },
      status: 'IN_PROPOSAL',
    });
  });

  it('rejects a foreign offered item', async () => {
    const { status } = await postJson('/exchange-requests', {
      offeredItemId: FOREIGN_ITEM_ID,
      wantedDescription: 'Что-то своё',
    });
    expect(status).toBe(400);
  });

  // «товар уже в резерве» — конфликт (409), а не ошибка валидации: у фронта на него свой текст
  it('rejects a reserved offered item with a conflict', async () => {
    const { status, body } = await postJson('/exchange-requests', {
      offeredItemId: RESERVED_ITEM_ID,
      wantedDescription: 'Что-то своё',
    });
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 409 });
  });

  it('rejects a request without wanted description', async () => {
    const { body: items } = await request('/items', { headers: authHeaders() });
    const itemId = items.find((i: { status: string }) => i.status === 'ACTIVE').id;

    const { status } = await postJson('/exchange-requests', {
      offeredItemId: itemId,
      wantedDescription: '   ',
    });
    expect(status).toBe(400);
  });

  it('patches an active request and recomputes chains', async () => {
    const { body: items } = await request('/items', { headers: authHeaders() });
    const itemId = items.find((i: { status: string }) => i.status === 'ACTIVE').id;
    const { body: created } = await postJson('/exchange-requests', {
      offeredItemId: itemId,
      wantedDescription: 'Книга по дизайну',
    });

    const { status, body } = await request(`/exchange-requests/${created.request.id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ wantedDescription: 'Кофемашина', wantedProfile: null }),
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ wantedDescription: 'Кофемашина', wantedProfile: null });
  });

  it('blocks editing a locked request', async () => {
    const { status, body } = await request(`/exchange-requests/${LOCKED_REQUEST_ID}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ wantedDescription: 'Что-то ещё' }),
    });

    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 400 });
  });

  it('deletes a request softly and blocks further edits', async () => {
    const { body: items } = await request('/items', { headers: authHeaders() });
    const itemId = items.find((i: { status: string }) => i.status === 'ACTIVE').id;
    const { body: created } = await postJson('/exchange-requests', {
      offeredItemId: itemId,
      wantedDescription: 'Рюкзак для походов',
    });

    const { status, body } = await request(`/exchange-requests/${created.request.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(status).toBe(200);
    expect(body).toEqual({ message: 'deleted' });

    const after = await request('/exchange-requests', { headers: authHeaders() });
    const removed = after.body.find((r: { id: string }) => r.id === created.request.id);
    expect(removed).toMatchObject({ status: 'REMOVED' });

    const patch = await request(`/exchange-requests/${created.request.id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ wantedDescription: 'Что-то ещё' }),
    });
    expect(patch.status).toBe(400);
  });
});

describe('chains', () => {
  // Свежий товар + заявка с кандидатными цепочками — чтобы тесты не зависели от общего состояния db.json
  async function createCandidateChain(): Promise<string> {
    const form = new FormData();
    form.append('title', `Товар ${Math.random()}`);
    form.append('description', 'Создаётся для независимого теста цепочки');
    form.append('image', new Blob(['fake-bytes'], { type: 'image/png' }), 'x.png');
    const { body: item } = await request('/items', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });

    const { body: created } = await postJson('/exchange-requests', {
      offeredItemId: item.id,
      wantedDescription: 'Наушники с шумоподавлением',
    });
    const { body: chains } = await request(`/exchange-requests/${created.request.id}/chains`, {
      headers: authHeaders(),
    });
    return chains[0].id;
  }

  // выбор не эксклюзивен: он не блокирует ни заявку, ни остальные варианты (макет 4.6)
  it('selects several chains of one request without locking it', async () => {
    const { body: requests } = await request('/exchange-requests', { headers: authHeaders() });
    const active = requests.find((r: { status: string }) => r.status === 'ACTIVE');

    const { body: created } = await postJson('/exchange-requests', {
      offeredItemId: active.offeredItemId,
      wantedDescription: 'Фитнес-браслет в подарок',
    });
    const { body: chains } = await request(`/exchange-requests/${created.request.id}/chains`, {
      headers: authHeaders(),
    });
    expect(chains.length).toBeGreaterThan(1);

    for (const chain of chains) {
      const { status, body } = await postJson(`/chains/${chain.id}/select`, {});
      expect(status).toBe(200);
      expect(body).toEqual({ id: chain.id, status: 'PROPOSED' });
    }

    const { body: after } = await request(`/exchange-requests/${created.request.id}/chains`, {
      headers: authHeaders(),
    });
    expect(after.map((c: { status: string }) => c.status)).toEqual(chains.map(() => 'PROPOSED'));

    const detail = await request(`/exchange-requests/${created.request.id}`, {
      headers: authHeaders(),
    });
    expect(detail.body.status).toBe('IN_PROPOSAL');
  });

  // выбор обратим: «Отменить выбор» возвращает цепочку в список вариантов
  it('cancels a selection and returns the chain to CANDIDATE', async () => {
    const chainId = await createCandidateChain();

    const { status: selectStatus } = await postJson(`/chains/${chainId}/select`, {});
    expect(selectStatus).toBe(200);

    const { status, body } = await request(`/chains/${chainId}/select`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(status).toBe(200);
    expect(body).toEqual({ id: chainId, status: 'CANDIDATE' });

    const { body: detail } = await request(`/chains/${chainId}`, { headers: authHeaders() });
    expect(detail.status).toBe('CANDIDATE');
    expect(detail.viewerPermissions).toMatchObject({ canSelect: true, canDeselect: false });
  });

  it('rejects cancelling a selection that was never made', async () => {
    const chainId = await createCandidateChain();

    const { status, body } = await request(`/chains/${chainId}/select`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 409 });
  });

  it('lists the response statuses of the chain participants', async () => {
    const chainId = await createCandidateChain();
    const { body: detail } = await request(`/chains/${chainId}`, { headers: authHeaders() });

    const { status, body } = await request(`/chains/${chainId}/responses`, {
      headers: authHeaders(),
    });
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(detail.participants.length);
  });

  it('accepts a chain response and reports readiness once everyone agrees', async () => {
    const chainId = await createCandidateChain();

    const { status, body } = await postJson(`/chains/${chainId}/responses/accept`, {});
    expect(status).toBe(200);
    expect(body).toMatchObject({ chainId, isReadyForSelection: true });
  });

  it('declines a chain response and keeps it unselectable', async () => {
    const chainId = await createCandidateChain();

    const { status, body } = await postJson(`/chains/${chainId}/responses/decline`, {});
    expect(status).toBe(200);
    expect(body).toMatchObject({ chainId, isReadyForSelection: false });
  });

  it('rejects a second response to the same chain', async () => {
    const chainId = await createCandidateChain();

    await postJson(`/chains/${chainId}/responses/accept`, {});
    const { status, body } = await postJson(`/chains/${chainId}/responses/decline`, {});
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 409 });
  });

  // фронт прячет кнопку отклика по canRespond, но прямой вызов API после дедлайна обязан
  // получать 410 (PROJECT.md §4.4) — иначе отклик уезжает «за окно» таймера
  it('rejects responding after the response deadline has passed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tricky-mock-test-'));
    const dbPath = join(dir, 'db.json');
    const passwordsPath = join(dir, 'passwords.json');
    copyFileSync(join(mockDir, 'db.json'), dbPath);
    copyFileSync(join(mockDir, 'passwords.json'), passwordsPath);
    // протухаем дедлайн кандидатной цепочки Анны (3001)
    const seed = JSON.parse(readFileSync(dbPath, 'utf8'));
    const chain = seed.chains.find(
      (c: { id: string }) => c.id === '30000000-0000-4000-8000-000000000001',
    );
    chain.responseDeadlineAt = new Date(Date.now() - 60_000).toISOString();
    writeFileSync(dbPath, JSON.stringify(seed, null, 2));

    const app = createMockApp({ dbPath, passwordsPath });
    const srv = app.listen(0);
    await new Promise<void>((resolve) => srv.once('listening', resolve));
    try {
      const address = srv.address();
      if (!address || typeof address === 'string')
        throw new Error('Не удалось определить порт мок-сервера');
      const url = `http://127.0.0.1:${address.port}`;
      const response = await fetch(
        `${url}/api/v1/chains/30000000-0000-4000-8000-000000000001/responses/accept`,
        { method: 'POST', headers: authHeaders() },
      );
      const body = await response.json();
      expect(response.status).toBe(410);
      expect(body).toMatchObject({ code: 410 });
    } finally {
      await new Promise<void>((resolve, reject) =>
        srv.close((err) => (err ? reject(err) : resolve())),
      );
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects selecting a chain that belongs to another user', async () => {
    const { body: login } = await postJson(
      '/account/login/',
      { email: 'ivan@example.com', password: 'demo1234' },
      false,
    );
    // цепочка 3001 привязана к заявке Анны — Иван её выбирать не может
    const { status, body } = await request('/chains/30000000-0000-4000-8000-000000000001/select', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.token}` },
    });
    expect(status).toBe(403);
    expect(body.code).toBe(403);
  });

  // удаление товара уносит его заявки каскадом — вместе с ними должны уходить и цепочки,
  // иначе осиротевшая цепочка ссылается на несуществующую заявку и отвечает 403 вместо 404
  it('removes the chains of the requests deleted together with the item', async () => {
    const form = new FormData();
    form.append('title', 'Товар с цепочками');
    form.append('description', 'Удаляется вместе с заявкой');
    form.append('image', new Blob(['fake-bytes'], { type: 'image/png' }), 'x.png');
    const { body: item } = await request('/items', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });

    const { body: created } = await postJson('/exchange-requests', {
      offeredItemId: item.id,
      wantedDescription: 'Электронная книга',
    });
    const { body: chains } = await request(`/exchange-requests/${created.request.id}/chains`, {
      headers: authHeaders(),
    });
    expect(chains.length).toBeGreaterThan(0);

    const archived = await request(`/items/${item.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(archived.status).toBe(200);

    const { status } = await request(`/chains/${chains[0].id}/select`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(status).toBe(404);
  });

  it('removes candidate chains when the request is removed', async () => {
    // берём именно свободный товар: выбор цепочки выше мог забронировать тот, что в фикстуре
    const { body: items } = await request('/items', { headers: authHeaders() });
    const free = items.find((i: { status: string }) => i.status === 'ACTIVE');
    const { body: created } = await postJson('/exchange-requests', {
      offeredItemId: free.id,
      wantedDescription: 'Рюкзак для походов',
    });
    const { body: chains } = await request(`/exchange-requests/${created.request.id}/chains`, {
      headers: authHeaders(),
    });
    expect(chains.length).toBeGreaterThan(0);

    await request(`/exchange-requests/${created.request.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    const { status } = await request(`/chains/${chains[0].id}/select`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(status).toBe(404);
  });
});

// Бронь товара: выбор цепочки не эксклюзивен и обратим, поэтому сам по себе ничего не резервирует
// и не блокирует заявку — товар остаётся свободным до отдельного шага сделки (PROJECT.md §4.5)
describe('item reservation lifecycle', () => {
  async function createItem(title: string) {
    const form = new FormData();
    form.append('title', title);
    form.append('description', 'Товар для проверки брони');
    form.append('image', new Blob(['fake-bytes'], { type: 'image/png' }), 'x.png');
    const { body } = await request('/items', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    return body;
  }

  const itemStatus = async (itemId: string) => {
    const { body } = await request(`/items/${itemId}`, { headers: authHeaders() });
    return body.status;
  };

  it('keeps the item free while its request collects and selects chains', async () => {
    const item = await createItem('Товар под бронь');
    expect(await itemStatus(item.id)).toBe('ACTIVE');

    const { body: created } = await postJson('/exchange-requests', {
      offeredItemId: item.id,
      wantedDescription: 'Наушники',
    });
    expect(await itemStatus(item.id)).toBe('ACTIVE');

    const { body: chains } = await request(`/exchange-requests/${created.request.id}/chains`, {
      headers: authHeaders(),
    });
    expect(chains.length).toBeGreaterThan(0);

    const { status: selectStatus } = await request(`/chains/${chains[0].id}/select`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(selectStatus).toBe(200);
    expect(await itemStatus(item.id)).toBe('ACTIVE');

    await request(`/exchange-requests/${created.request.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(await itemStatus(item.id)).toBe('ACTIVE');
  });
});

// Фикстура — часть контракта мока: код опирается на «RESERVED ⟺ есть заявка в LOCKED»
// (releaseItemIfUnused, запрет архивации), а рассинхрон в сидах ломает демо-сценарии
describe('seed fixture', () => {
  interface SeedDb {
    items: { id: string; status: string }[];
    exchangeRequests: { id: string; status: string; offeredItemId: string }[];
    chains: { id: string; requestId: string }[];
  }

  const seed: SeedDb = JSON.parse(readFileSync(join(mockDir, 'db.json'), 'utf8'));

  it('reserves exactly the items held by a locked request', () => {
    const lockedItemIds = new Set(
      seed.exchangeRequests.filter((r) => r.status === 'LOCKED').map((r) => r.offeredItemId),
    );

    for (const item of seed.items) {
      expect([item.id, item.status === 'RESERVED']).toEqual([item.id, lockedItemIds.has(item.id)]);
    }
  });

  it('has no chains pointing at a missing request', () => {
    const requestIds = new Set(seed.exchangeRequests.map((r) => r.id));
    const orphans = seed.chains.filter((c) => !requestIds.has(c.requestId));

    expect(orphans).toEqual([]);
  });

  it('offers only existing items in requests', () => {
    const itemIds = new Set(seed.items.map((i) => i.id));
    const dangling = seed.exchangeRequests.filter((r) => !itemIds.has(r.offeredItemId));

    expect(dangling).toEqual([]);
  });
});
