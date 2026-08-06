import { useState } from 'react';

import { App as AntApp, Form } from 'antd';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router';

import { getErrorMessage } from '@shared/lib/errorMessage';
import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@shared/lib/validation';

import { resetPassword, sendRecoveryCode, verifyRecoveryCode } from '../api/authApi';

export const OTP_LENGTH = 6;

interface RecoveryEmailValues {
  email: string;
}

interface NewPasswordValues {
  password: string;
  confirm: string;
}

export type RecoveryState =
  | { step: 'email'; sending: boolean }
  | {
      step: 'code';
      email: string;
      otp: string;
      otpInvalid: boolean;
      action: 'idle' | 'sending' | 'verifying';
    }
  | { step: 'password'; email: string; otp: string; resetting: boolean }
  | { step: 'success' };

export function useRecoveryFlow() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [state, setState] = useState<RecoveryState>({ step: 'email', sending: false });

  const [emailForm] = Form.useForm<RecoveryEmailValues>();
  const emailValue = Form.useWatch('email', emailForm);
  const emailReady = EMAIL_PATTERN.test(emailValue ?? '');

  const [passwordForm] = Form.useForm<NewPasswordValues>();
  const newPassword = Form.useWatch('password', passwordForm);
  const confirm = Form.useWatch('confirm', passwordForm);
  const passwordReady =
    (newPassword?.length ?? 0) >= PASSWORD_MIN_LENGTH && !!confirm && confirm === newPassword;

  async function handleSend(values: RecoveryEmailValues) {
    if (state.step !== 'email') return;
    setState({ step: 'email', sending: true });
    try {
      const email = values.email.trim();
      await sendRecoveryCode(email);
      setState({ step: 'code', email, otp: '', otpInvalid: false, action: 'idle' });
    } catch (error) {
      message.error(getErrorMessage(error, { 404: 'Пользователь с таким email не найден' }));
      setState({ step: 'email', sending: false });
    }
  }

  async function handleResend() {
    if (state.step !== 'code') return;
    const { email } = state;
    setState({ ...state, action: 'sending' });
    try {
      await sendRecoveryCode(email);
      setState({ step: 'code', email, otp: '', otpInvalid: false, action: 'idle' });
      message.success('Код отправлен снова');
    } catch (error) {
      message.error(getErrorMessage(error, {}));
      setState({ ...state, action: 'idle' });
    }
  }

  function setOtp(otp: string) {
    if (state.step !== 'code') return;
    setState({ ...state, otp, otpInvalid: false });
  }

  async function handleVerify() {
    if (state.step !== 'code') return;
    const { email, otp } = state;
    setState({ ...state, action: 'verifying' });
    try {
      await verifyRecoveryCode(email, otp);
      setState({ step: 'password', email, otp, resetting: false });
    } catch (error) {
      // otpInvalid отражает именно «код не подошёл» (400) — не сетевую/прочую ошибку
      const isWrongCode = isAxiosError(error) && error.response?.status === 400;
      message.error(getErrorMessage(error, { 400: 'Неверный или истёкший код' }));
      setState({ step: 'code', email, otp, otpInvalid: isWrongCode, action: 'idle' });
    }
  }

  async function handleReset(values: NewPasswordValues) {
    if (state.step !== 'password') return;
    const { email, otp } = state;
    setState({ ...state, resetting: true });
    try {
      await resetPassword(email, otp, values.password);
      setState({ step: 'success' });
    } catch (error) {
      message.error(getErrorMessage(error, { 400: 'Неверный или истёкший код' }));
      setState({ step: 'password', email, otp, resetting: false });
    }
  }

  function goBack() {
    navigate('/login');
  }

  function goToLogin() {
    navigate('/login', { replace: true });
  }

  return {
    state,
    emailForm,
    emailReady,
    passwordForm,
    passwordReady,
    handleSend,
    handleResend,
    setOtp,
    handleVerify,
    handleReset,
    goBack,
    goToLogin,
  };
}
