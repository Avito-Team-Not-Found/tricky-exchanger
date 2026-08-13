import type { ReactNode } from 'react';

import { act, renderHook, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { changePassword } from '../api/passwordChangeApi';

import { useChangePassword } from './useChangePassword';

vi.mock('../api/passwordChangeApi', () => ({
  changePassword: vi.fn(),
}));

const mockedChangePassword = vi.mocked(changePassword);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AntApp>
      <MemoryRouter>{children}</MemoryRouter>
    </AntApp>
  );
}

describe('useChangePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disallows submit on an empty form', () => {
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    expect(result.current.canSubmit).toBe(false);
  });

  it('moves to the success state on a successful change', async () => {
    mockedChangePassword.mockResolvedValue();
    const { result } = renderHook(() => useChangePassword(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        currentPassword: 'old-password',
        newPassword: 'new-password-1',
        confirm: 'new-password-1',
      });
    });

    expect(result.current.state).toEqual({ status: 'success' });
    expect(mockedChangePassword).toHaveBeenCalledWith(
      'old-password',
      'new-password-1',
      'new-password-1',
    );
  });

  it('stays on the form and shows a toast when the current password is wrong', async () => {
    const badRequest = new AxiosError('Bad Request');
    Object.assign(badRequest, { response: { status: 400 } });
    mockedChangePassword.mockRejectedValue(badRequest);
    const { result } = renderHook(() => useChangePassword(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        currentPassword: 'wrong',
        newPassword: 'new-password-1',
        confirm: 'new-password-1',
      });
    });

    expect(await screen.findByText('Неверный текущий пароль')).toBeInTheDocument();
    expect(result.current.state).toEqual({ status: 'form', submitting: false });
  });
});
