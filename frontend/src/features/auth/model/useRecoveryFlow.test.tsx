import type { ReactNode } from 'react';

import { act, renderHook, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetPassword, sendRecoveryCode, verifyRecoveryCode } from '../api/authApi';

import { useRecoveryFlow } from './useRecoveryFlow';

vi.mock('../api/authApi', () => ({
  sendRecoveryCode: vi.fn(),
  verifyRecoveryCode: vi.fn(),
  resetPassword: vi.fn(),
}));

const mockedSend = vi.mocked(sendRecoveryCode);
const mockedVerify = vi.mocked(verifyRecoveryCode);
const mockedReset = vi.mocked(resetPassword);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AntApp>
      <MemoryRouter>{children}</MemoryRouter>
    </AntApp>
  );
}

describe('useRecoveryFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // реактивность emailReady/passwordReady на ввод в поля формы завязана на смонтированные
  // Form.Item (antd Form.useWatch не отслеживает поля вне рендера) — проверяется в RecoveryFlow.test.tsx
  it('starts on the email step with emailReady false', () => {
    const { result } = renderHook(() => useRecoveryFlow(), { wrapper });
    expect(result.current.emailReady).toBe(false);
    expect(result.current.state).toEqual({ step: 'email', sending: false });
  });

  it('moves from email to code step on a successful send', async () => {
    mockedSend.mockResolvedValue({ message: 'code_sent', code: '482913' });
    const { result } = renderHook(() => useRecoveryFlow(), { wrapper });

    await act(async () => {
      await result.current.handleSend({ email: 'anna@example.com' });
    });

    expect(result.current.state).toEqual({
      step: 'code',
      email: 'anna@example.com',
      otp: '',
      otpInvalid: false,
      action: 'idle',
    });
  });

  it('stays on the email step and shows a toast when the email is unknown', async () => {
    const notFound = new AxiosError('Not Found');
    Object.assign(notFound, { response: { status: 404 } });
    mockedSend.mockRejectedValue(notFound);
    const { result } = renderHook(() => useRecoveryFlow(), { wrapper });

    await act(async () => {
      await result.current.handleSend({ email: 'ghost@example.com' });
    });

    expect(await screen.findByText('Пользователь с таким email не найден')).toBeInTheDocument();
    expect(result.current.state.step).toBe('email');
  });

  it('marks the code invalid on a wrong-code (400) response but not on a network error', async () => {
    mockedSend.mockResolvedValue({ message: 'code_sent', code: '482913' });
    const { result } = renderHook(() => useRecoveryFlow(), { wrapper });
    await act(async () => {
      await result.current.handleSend({ email: 'anna@example.com' });
    });
    act(() => result.current.setOtp('000000'));

    const wrongCode = new AxiosError('Bad Request');
    Object.assign(wrongCode, { response: { status: 400 } });
    mockedVerify.mockRejectedValueOnce(wrongCode);
    await act(async () => {
      await result.current.handleVerify();
    });
    expect(result.current.state).toMatchObject({ step: 'code', otpInvalid: true });

    act(() => result.current.setOtp('482913'));
    mockedVerify.mockRejectedValueOnce(new AxiosError('Network Error'));
    await act(async () => {
      await result.current.handleVerify();
    });
    expect(result.current.state).toMatchObject({ step: 'code', otpInvalid: false });
  });

  it('moves through verify and reset to the success step', async () => {
    mockedSend.mockResolvedValue({ message: 'code_sent', code: '482913' });
    mockedVerify.mockResolvedValue();
    mockedReset.mockResolvedValue();
    const { result } = renderHook(() => useRecoveryFlow(), { wrapper });

    await act(async () => {
      await result.current.handleSend({ email: 'anna@example.com' });
    });
    act(() => result.current.setOtp('482913'));
    await act(async () => {
      await result.current.handleVerify();
    });
    expect(result.current.state).toMatchObject({ step: 'password' });

    await act(async () => {
      await result.current.handleReset({ password: 'new-password-1', confirm: 'new-password-1' });
    });
    expect(result.current.state).toEqual({ step: 'success' });
    expect(mockedReset).toHaveBeenCalledWith('anna@example.com', '482913', 'new-password-1');
  });
});
