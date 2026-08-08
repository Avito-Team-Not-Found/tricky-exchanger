import type { ReactNode } from 'react';

import { act, renderHook, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '@app/store';
import { logout } from '@app/store/slices/userSlice';

import { registerRequest } from '../api/authApi';

import { useRegister } from './useRegister';

vi.mock('../api/authApi', () => ({
  registerRequest: vi.fn(),
}));

const mockedRegisterRequest = vi.mocked(registerRequest);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <AntApp>
        <MemoryRouter>{children}</MemoryRouter>
      </AntApp>
    </Provider>
  );
}

describe('useRegister', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(logout());
    vi.clearAllMocks();
  });

  // реактивность canSubmit на ввод в поля формы завязана на смонтированные Form.Item
  // (antd Form.useWatch не отслеживает поля вне рендера) — проверяется в RegisterForm.test.tsx
  it('disallows submit on an empty form', () => {
    const { result } = renderHook(() => useRegister(), { wrapper });
    expect(result.current.canSubmit).toBe(false);
  });

  it('stores the session on a successful registration', async () => {
    mockedRegisterRequest.mockResolvedValue({
      token: 'jwt',
      user: { id: '1', fullName: 'Анна', email: 'anna@example.com' },
    });
    const { result } = renderHook(() => useRegister(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        name: 'Анна',
        email: 'anna@example.com',
        password: 'demo1234',
        confirm: 'demo1234',
      });
    });

    expect(store.getState().user.token).toBe('jwt');
    expect(mockedRegisterRequest).toHaveBeenCalledWith('Анна', 'anna@example.com', 'demo1234');
  });

  it('shows a toast when the email is already registered', async () => {
    const conflict = new AxiosError('Conflict');
    Object.assign(conflict, { response: { status: 409 } });
    mockedRegisterRequest.mockRejectedValue(conflict);
    const { result } = renderHook(() => useRegister(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        name: 'Анна',
        email: 'anna@example.com',
        password: 'demo1234',
        confirm: 'demo1234',
      });
    });

    expect(
      await screen.findByText('Пользователь с таким email уже зарегистрирован'),
    ).toBeInTheDocument();
    expect(store.getState().user.token).toBeNull();
  });
});
