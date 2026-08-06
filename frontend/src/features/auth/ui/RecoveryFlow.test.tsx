import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetPassword, sendRecoveryCode, verifyRecoveryCode } from '../api/authApi';

import { RecoveryFlow } from './RecoveryFlow';

vi.mock('../api/authApi', () => ({
  resetPassword: vi.fn(),
  sendRecoveryCode: vi.fn(),
  verifyRecoveryCode: vi.fn(),
}));

const mockedSend = vi.mocked(sendRecoveryCode);
const mockedVerify = vi.mocked(verifyRecoveryCode);
const mockedReset = vi.mocked(resetPassword);

function setup() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<RecoveryFlow />} />
          <Route path="/login" element={<div>login screen</div>} />
        </Routes>
      </MemoryRouter>
    </AntApp>,
  );
}

async function sendCode(user: ReturnType<typeof userEvent.setup>, email = 'anna@example.com') {
  await user.type(screen.getByLabelText(/Email/i), email);
  await user.click(screen.getByRole('button', { name: /Отправить код/ }));
}

async function fillOtp(user: ReturnType<typeof userEvent.setup>, code: string) {
  const firstInput = screen.getAllByRole('textbox')[0];
  await user.type(firstInput, code);
}

describe('RecoveryFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the submit button disabled until the email is valid', async () => {
    const user = userEvent.setup();
    setup();

    const submit = screen.getByRole('button', { name: /Отправить код/ });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Email/i), 'not-an-email');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Email/i), '@example.com');
    expect(submit).toBeEnabled();
  });

  it('goes back to login via the back button', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /Назад/ }));

    expect(screen.getByText('login screen')).toBeInTheDocument();
  });

  it('moves to the code step after sending the code', async () => {
    const user = userEvent.setup();
    mockedSend.mockResolvedValue({ message: 'code_sent', code: '482913' });
    setup();

    await sendCode(user);

    expect(await screen.findByText('Введите код')).toBeInTheDocument();
    expect(screen.getByText(/anna@example.com/)).toBeInTheDocument();
    expect(mockedSend).toHaveBeenCalledWith('anna@example.com');
  });

  it('shows a toast for an unknown email', async () => {
    const user = userEvent.setup();
    const error = new AxiosError('Not Found');
    Object.assign(error, { response: { status: 404 } });
    mockedSend.mockRejectedValue(error);
    setup();

    await sendCode(user);

    expect(await screen.findByText('Пользователь с таким email не найден')).toBeInTheDocument();
    expect(screen.queryByText('Введите код')).not.toBeInTheDocument();
  });

  it('verifies the code and moves to the new password step', async () => {
    const user = userEvent.setup();
    mockedSend.mockResolvedValue({ message: 'code_sent', code: '482913' });
    mockedVerify.mockResolvedValue();
    setup();

    await sendCode(user);
    await screen.findByText('Введите код');

    const confirm = screen.getByRole('button', { name: /Подтвердить/ });
    expect(confirm).toBeDisabled();

    await fillOtp(user, '482913');
    expect(confirm).toBeEnabled();

    await user.click(confirm);

    expect(await screen.findByRole('heading', { name: 'Новый пароль' })).toBeInTheDocument();
    expect(mockedVerify).toHaveBeenCalledWith('anna@example.com', '482913');
  });

  it('shows a toast for a wrong code', async () => {
    const user = userEvent.setup();
    mockedSend.mockResolvedValue({ message: 'code_sent', code: '482913' });
    const error = new AxiosError('Bad Request');
    Object.assign(error, { response: { status: 400 } });
    mockedVerify.mockRejectedValue(error);
    setup();

    await sendCode(user);
    await screen.findByText('Введите код');
    await fillOtp(user, '000000');
    await user.click(screen.getByRole('button', { name: /Подтвердить/ }));

    expect(await screen.findByText('Неверный или истёкший код')).toBeInTheDocument();
    expect(screen.queryByText('Новый пароль')).not.toBeInTheDocument();
    screen
      .getAllByRole('textbox')
      .forEach((box) => expect(box).toHaveClass('ant-input-status-error'));
  });

  it('does not mark the code invalid on a network error', async () => {
    const user = userEvent.setup();
    mockedSend.mockResolvedValue({ message: 'code_sent', code: '482913' });
    mockedVerify.mockRejectedValue(new AxiosError('Network Error'));
    setup();

    await sendCode(user);
    await screen.findByText('Введите код');
    await fillOtp(user, '482913');
    await user.click(screen.getByRole('button', { name: /Подтвердить/ }));

    expect(
      await screen.findByText('Не удалось подключиться. Повторите попытку'),
    ).toBeInTheDocument();
    screen
      .getAllByRole('textbox')
      .forEach((box) => expect(box).not.toHaveClass('ant-input-status-error'));
  });

  it('completes the flow and lets the user go to login', async () => {
    const user = userEvent.setup();
    mockedSend.mockResolvedValue({ message: 'code_sent', code: '482913' });
    mockedVerify.mockResolvedValue();
    mockedReset.mockResolvedValue();
    setup();

    await sendCode(user);
    await screen.findByText('Введите код');
    await fillOtp(user, '482913');
    await user.click(screen.getByRole('button', { name: /Подтвердить/ }));

    await screen.findByRole('heading', { name: 'Новый пароль' });
    await user.type(screen.getByLabelText(/Новый пароль/i), 'password123');
    await user.type(screen.getByLabelText(/Повторите пароль/i), 'password123');
    await user.click(screen.getByRole('button', { name: /Изменить пароль/ }));

    expect(await screen.findByText('Пароль изменён')).toBeInTheDocument();
    expect(mockedReset).toHaveBeenCalledWith('anna@example.com', '482913', 'password123');

    await user.click(screen.getByRole('button', { name: /Войти/ }));
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });
});
