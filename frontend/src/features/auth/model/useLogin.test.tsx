import type { ReactNode } from 'react';

import { act, renderHook, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '@app/store';
import { logout } from '@app/store/slices/userSlice';

import { loginRequest } from '../api/authApi';

import { useLogin } from './useLogin';

vi.mock('../api/authApi', () => ({
  loginRequest: vi.fn(),
}));

const mockedLoginRequest = vi.mocked(loginRequest);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <AntApp>
        <MemoryRouter>{children}</MemoryRouter>
      </AntApp>
    </Provider>
  );
}

describe('useLogin', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(logout());
    vi.clearAllMocks();
  });

  // реактивность canSubmit на ввод в поля формы завязана на смонтированные Form.Item
  // (antd Form.useWatch не отслеживает поля вне рендера) — проверяется в LoginForm.test.tsx
  it('disallows submit on an empty form', () => {
    const { result } = renderHook(() => useLogin(), { wrapper });
    expect(result.current.canSubmit).toBe(false);
  });

  it('stores the session on a successful login', async () => {
    mockedLoginRequest.mockResolvedValue({
      token: 'jwt',
      user: { id: '1', fullName: 'Анна', email: 'anna@example.com' },
    });
    const { result } = renderHook(() => useLogin(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({ email: 'anna@example.com', password: 'demo1234' });
    });

    expect(store.getState().user.token).toBe('jwt');
  });

  it('shows a single message for a wrong password or an unregistered email', async () => {
    // бэкенд осознанно отвечает 401 в обоих случаях, чтобы нельзя было перебором проверять email
    const unauthorized = new AxiosError('Unauthorized');
    Object.assign(unauthorized, { response: { status: 401 } });
    mockedLoginRequest.mockRejectedValue(unauthorized);
    const { result } = renderHook(() => useLogin(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({ email: 'ghost@example.com', password: 'whatever' });
    });

    expect(await screen.findByText('Неверный email или пароль')).toBeInTheDocument();
    expect(store.getState().user.token).toBeNull();
  });
});
