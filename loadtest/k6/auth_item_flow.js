/**
 * Нагрузочный сценарий: register → create item → list items → login.
 *
 * Запуск:
 *   BASE_URL=http://localhost:8080 k6 run loadtest/k6/auth_item_flow.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const flowDuration = new Trend('auth_item_flow_duration', true);
const flowFailRate = new Rate('auth_item_flow_errors');

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '40s', target: 30 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
    auth_item_flow_errors: ['rate<0.05'],
  },
};

function jsonHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export default function () {
  const started = Date.now();
  let ok = true;

  const email = `k6-${__VU}-${__ITER}-${Date.now()}@example.com`;
  const password = 'password123';

  const registerRes = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({
      fullName: `K6 User ${__VU}`,
      email,
      password,
    }),
    { headers: jsonHeaders() },
  );
  const registered = check(registerRes, {
    'register 201': (r) => r.status === 201,
    'register has token': (r) => !!r.json('token'),
  });
  ok = ok && registered;
  if (!registered) {
    flowFailRate.add(1);
    flowDuration.add(Date.now() - started);
    sleep(1);
    return;
  }

  const token = registerRes.json('token');

  const createItemRes = http.post(
    `${BASE_URL}/api/v1/items`,
    JSON.stringify({
      title: `K6 Item ${__VU}-${__ITER}`,
      description: 'load test item',
      category: 'test',
    }),
    { headers: jsonHeaders(token) },
  );
  ok =
    ok &&
    check(createItemRes, {
      'create item 201': (r) => r.status === 201,
      'create item has id': (r) => r.json('id') > 0,
    });

  const listRes = http.get(`${BASE_URL}/api/v1/items`, {
    headers: jsonHeaders(token),
  });
  ok =
    ok &&
    check(listRes, {
      'list items 200': (r) => r.status === 200,
      'list items total >= 1': (r) => r.json('total') >= 1,
    });

  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: jsonHeaders() },
  );
  ok =
    ok &&
    check(loginRes, {
      'login 200': (r) => r.status === 200,
      'login has token': (r) => !!r.json('token'),
    });

  flowFailRate.add(ok ? 0 : 1);
  flowDuration.add(Date.now() - started);
  sleep(0.5);
}

export function setup() {
  const res = http.get(`${BASE_URL}/healthz`);
  if (res.status !== 200) {
    throw new Error(`API not healthy at ${BASE_URL}/healthz: status=${res.status}`);
  }
  return { baseUrl: BASE_URL };
}
