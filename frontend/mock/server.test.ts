// @vitest-environment node
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMockApp } from './server.js';

const mockDir = dirname(fileURLToPath(import.meta.url));

const DEMO_EMAIL = 'anna@example.com';

let server: Server;
let baseUrl: string;
let tmpDir: string;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, init);
  // тела ответов мока динамические — тесты читают произвольные поля, типизировать каждое незачем
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await response.json()) as any;
  return { status: response.status, body };
}

function postJson(path: string, payload: unknown) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

// Вход и регистрация из мока удалены вместе со старым контрактом (SCRUM-50): токен выдать
// больше нечем, поэтому защищённые ручки тестируются только через отказ без валидного токена
describe('authorization', () => {
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
    const { status, body } = await postJson('/account/password-recovery/send-code/', {
      email: DEMO_EMAIL,
    });

    expect(status).toBe(200);
    expect(body.message).toBe('code_sent');
    expect(body.code).toMatch(/^\d{6}$/);
  });

  it('rejects an unregistered email', async () => {
    const { status, body } = await postJson('/account/password-recovery/send-code/', {
      email: 'ghost@example.com',
    });

    expect(status).toBe(404);
    expect(body.code).toBe(404);
  });

  it('rejects an unknown code', async () => {
    await postJson('/account/password-recovery/send-code/', { email: DEMO_EMAIL });

    const { status } = await postJson('/account/password-recovery/verify-code/', {
      email: DEMO_EMAIL,
      code: '000000',
    });
    expect(status).toBe(400);
  });

  it('completes the flow and resets the password', async () => {
    const { body: sent } = await postJson('/account/password-recovery/send-code/', {
      email: DEMO_EMAIL,
    });

    const verify = await postJson('/account/password-recovery/verify-code/', {
      email: DEMO_EMAIL,
      code: sent.code,
    });
    expect(verify.status).toBe(200);
    expect(verify.body).toEqual({ message: 'code_valid' });

    const reset = await postJson('/account/password-recovery/reset-password/', {
      email: DEMO_EMAIL,
      code: sent.code,
      password: 'new-password-123',
    });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ message: 'password_changed' });
  });

  it('rejects a too-short new password', async () => {
    const { body: sent } = await postJson('/account/password-recovery/send-code/', {
      email: DEMO_EMAIL,
    });

    const { status } = await postJson('/account/password-recovery/reset-password/', {
      email: DEMO_EMAIL,
      code: sent.code,
      password: 'short',
    });
    expect(status).toBe(400);
  });
});

// Фикстура — часть контракта мока: код опирается на «RESERVED ⟺ есть заявка в LOCKED»
// (запрет архивации), а рассинхрон в сидах ломает демо-сценарии
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
