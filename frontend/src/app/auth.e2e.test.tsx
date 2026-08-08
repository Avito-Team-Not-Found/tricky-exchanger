import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp, ConfigProvider } from 'antd';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '@app/store';
import { logout } from '@app/store/slices/userSlice';

import { loginRequest, registerRequest } from '@features/auth/api/authApi';

import { fetchCategories } from '@entities/category/api';
import { fetchItems } from '@entities/item/api';
import type { Item } from '@entities/item/model';

import { AuthPage } from '../pages/auth/AuthPage';
import { ProductsPage } from '../pages/products/ProductsPage';

vi.mock('@features/auth/api/authApi', () => ({
  loginRequest: vi.fn(),
  registerRequest: vi.fn(),
}));

vi.mock('@entities/item/api', () => ({
  fetchItems: vi.fn(),
}));

vi.mock('@entities/category/api', () => ({
  fetchCategories: vi.fn(),
}));

const mockedLoginRequest = vi.mocked(loginRequest);
const mockedRegisterRequest = vi.mocked(registerRequest);
const mockedFetchItems = vi.mocked(fetchItems);
const mockedFetchCategories = vi.mocked(fetchCategories);

const demoItem: Item = {
  id: 1,
  title: 'Кухонный комбайн Bosch',
  description: 'Почти новый',
  categoryId: null,
  imageUrl: null,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

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
              </Routes>
            </MemoryRouter>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>
    </Provider>,
  );
}

describe('auth e2e', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(logout());
    vi.clearAllMocks();
    mockedFetchItems.mockResolvedValue({ items: [], total: 0 });
    mockedFetchCategories.mockResolvedValue([]);
  });

  it('logs in, redirects and renders the products page with the owned items', async () => {
    mockedLoginRequest.mockResolvedValue({
      token: 'jwt',
      user: { id: '1', fullName: 'Анна', email: 'anna@example.com' },
    });
    mockedFetchItems.mockResolvedValue({ items: [demoItem], total: 1 });
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText(/Email/i), 'anna@example.com');
    await user.type(screen.getByLabelText(/Пароль/i), 'demo1234');
    await user.click(screen.getByRole('button', { name: /Войти/ }));

    expect(await screen.findByText('Кухонный комбайн Bosch')).toBeInTheDocument();
    expect(screen.getByText('Товары')).toBeInTheDocument();
  });

  it('registers a new user and redirects to the empty products page', async () => {
    mockedRegisterRequest.mockResolvedValue({
      token: 'jwt',
      user: { id: '2', fullName: 'Елена', email: 'elena@example.com' },
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByText('Регистрация'));
    await user.type(screen.getByLabelText('Имя'), 'Елена');
    await user.type(screen.getByLabelText(/Email/i), 'elena@example.com');
    await user.type(screen.getByLabelText(/^Пароль$/), 'password123');
    await user.type(screen.getByLabelText(/Повторите пароль/i), 'password123');
    await user.click(screen.getByRole('button', { name: /Зарегистрироваться/ }));

    expect(await screen.findByText('У вас пока нет товаров')).toBeInTheDocument();
  });
});
