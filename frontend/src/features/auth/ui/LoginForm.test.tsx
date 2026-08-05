import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '@app/store';
import { logout } from '@app/store/slices/userSlice';

import { loginRequest } from '../api/authApi';

import { LoginForm } from './LoginForm';

vi.mock('../api/authApi', () => ({
  loginRequest: vi.fn(),
}));

const mockedLoginRequest = vi.mocked(loginRequest);

function setup() {
  return render(
    <Provider store={store}>
      <AntApp>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginForm />} />
            <Route path="/products" element={<div>products screen</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </Provider>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(logout());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the submit button until both fields are filled', async () => {
    const user = userEvent.setup();
    setup();

    const submit = screen.getByRole('button', { name: /Войти/ });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Email/i), 'anna@example.com');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Пароль/i), 'demo1234');
    expect(submit).toBeEnabled();
  });

  it('stays disabled for an invalid email format even with a password filled', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/Email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/Пароль/i), 'demo1234');

    expect(screen.getByRole('button', { name: /Войти/ })).toBeDisabled();
  });

  it('stores the session and redirects to /products on success', async () => {
    const user = userEvent.setup();
    mockedLoginRequest.mockResolvedValue({
      token: 'jwt',
      user: { id: '1', name: 'Анна', email: 'anna@example.com' },
    });
    setup();

    await user.type(screen.getByLabelText(/Email/i), 'anna@example.com');
    await user.type(screen.getByLabelText(/Пароль/i), 'demo1234');
    await user.click(screen.getByRole('button', { name: /Войти/ }));

    expect(await screen.findByText('products screen')).toBeInTheDocument();
    expect(mockedLoginRequest).toHaveBeenCalledWith('anna@example.com', 'demo1234');
    expect(store.getState().user.token).toBe('jwt');
  });

  it('shows a toast on wrong credentials and keeps the form filled', async () => {
    const user = userEvent.setup();
    const error = new AxiosError('Unauthorized');
    Object.assign(error, { response: { status: 401 } });
    mockedLoginRequest.mockRejectedValue(error);
    setup();

    await user.type(screen.getByLabelText(/Email/i), 'anna@example.com');
    await user.type(screen.getByLabelText(/Пароль/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /Войти/ }));

    expect(await screen.findByText('Неверный email или пароль')).toBeInTheDocument();
    expect(store.getState().user.token).toBeNull();
    expect(screen.getByLabelText(/Email/i)).toHaveValue('anna@example.com');
  });
});
