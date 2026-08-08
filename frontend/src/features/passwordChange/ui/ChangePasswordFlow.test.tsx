import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { changePassword } from '../api/passwordChangeApi';

import { ChangePasswordFlow } from './ChangePasswordFlow';

vi.mock('../api/passwordChangeApi', () => ({
  changePassword: vi.fn(),
}));

const mockedChangePassword = vi.mocked(changePassword);

function setup() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/profile/password']}>
        <Routes>
          <Route path="/profile/password" element={<ChangePasswordFlow />} />
          <Route path="/profile" element={<div>profile screen</div>} />
        </Routes>
      </MemoryRouter>
    </AntApp>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Текущий пароль/i), 'demo1234');
  await user.type(screen.getByLabelText(/^Новый пароль$/), 'new-pass-123');
  await user.type(screen.getByLabelText(/Повторите новый пароль/i), 'new-pass-123');
}

describe('ChangePasswordFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the submit button disabled until all fields are valid', async () => {
    const user = userEvent.setup();
    setup();

    const submit = screen.getByRole('button', { name: /Сохранить пароль/ });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Текущий пароль/i), 'demo1234');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/^Новый пароль$/), 'new-pass-123');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Повторите новый пароль/i), 'mismatch');
    expect(submit).toBeDisabled();
  });

  it('enables the submit button when passwords match', async () => {
    const user = userEvent.setup();
    setup();

    await fillValidForm(user);

    expect(screen.getByRole('button', { name: /Сохранить пароль/ })).toBeEnabled();
  });

  it('shows a toast and keeps the form when the current password is wrong', async () => {
    const user = userEvent.setup();
    const error = new AxiosError('Bad Request');
    Object.assign(error, { response: { status: 400 } });
    mockedChangePassword.mockRejectedValue(error);
    setup();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /Сохранить пароль/ }));

    expect(await screen.findByText('Неверный текущий пароль')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Новый пароль$/)).toHaveValue('new-pass-123');
    expect(screen.queryByText('Пароль изменён')).not.toBeInTheDocument();
  });

  it('shows the success screen and returns to the profile', async () => {
    const user = userEvent.setup();
    mockedChangePassword.mockResolvedValue();
    setup();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /Сохранить пароль/ }));

    expect(await screen.findByText('Пароль изменён')).toBeInTheDocument();
    expect(mockedChangePassword).toHaveBeenCalledWith('demo1234', 'new-pass-123', 'new-pass-123');

    await user.click(screen.getByRole('button', { name: /Готово/ }));
    expect(screen.getByText('profile screen')).toBeInTheDocument();
  });

  it('goes back to the profile via the back button', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(screen.getByText('profile screen')).toBeInTheDocument();
  });
});
