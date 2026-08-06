/// <reference types="node" />
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp, ConfigProvider } from 'antd';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '@app/store';
import { logout } from '@app/store/slices/userSlice';

import { createMockApp } from '../../mock/server';
import { AuthPage } from '../pages/auth/AuthPage';
import { ExchangeRequestsPage } from '../pages/exchange-requests/ExchangeRequestsPage';
import { ProductsPage } from '../pages/products/ProductsPage';

vi.mock('@shared/config/env', () => ({
  env: { apiBaseUrl: 'http://127.0.0.1:4137' },
  isDev: true,
}));

const mockDir = dirname(fileURLToPath(import.meta.url));

let server: Server;
let tmpDir: string;

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider>
          <AntApp>
            <MemoryRouter initialEntries={['/login']}>
              <Routes>
                <Route path="/login" element={<AuthPage />} />
                <Route path="/register" element={<AuthPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/exchange-requests" element={<ExchangeRequestsPage />} />
              </Routes>
            </MemoryRouter>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>
    </Provider>,
  );
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tricky-auth-e2e-'));
  const dbPath = join(tmpDir, 'db.json');
  const passwordsPath = join(tmpDir, 'passwords.json');
  copyFileSync(join(mockDir, '..', '..', 'mock', 'db.json'), dbPath);
  copyFileSync(join(mockDir, '..', '..', 'mock', 'passwords.json'), passwordsPath);
  const app = createMockApp({ dbPath, passwordsPath });
  server = app.listen(4137);
  await new Promise<void>((resolve) => server.once('listening', resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  localStorage.clear();
  store.dispatch(logout());
});

describe('auth e2e against the mock', () => {
  it('logs in with demo credentials, redirects and renders the products page', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText(/Email/i), 'anna@example.com');
    await user.type(screen.getByLabelText(/Пароль/i), 'demo1234');
    await user.click(screen.getByRole('button', { name: /Войти/ }));

    expect(await screen.findByText('Кухонный комбайн Bosch')).toBeInTheDocument();
    expect(screen.getByText('Товары')).toBeInTheDocument();
  });

  it('registers a new user and redirects to products', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByText('Регистрация'));
    await user.type(screen.getByLabelText('Имя'), 'Елена');
    await user.type(screen.getByLabelText(/Email/i), `elena${Date.now()}@example.com`);
    await user.type(screen.getByLabelText('Пароль'), 'password123');
    await user.type(screen.getByLabelText('Повторите пароль'), 'password123');
    await user.click(screen.getByRole('button', { name: /Зарегистрироваться/ }));

    expect(await screen.findByText('У вас пока нет товаров')).toBeInTheDocument();
  });
});
