import { useState } from 'react';

import { App as AntApp, Form } from 'antd';

import { getErrorMessage } from '@shared/lib/errorMessage';
import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@shared/lib/validation';

import { loginRequest } from '../api/authApi';

import { useApplySession } from './useApplySession';

export interface LoginValues {
  email: string;
  password: string;
}

export function useLogin() {
  const { message } = AntApp.useApp();
  const applySession = useApplySession();
  const [form] = Form.useForm<LoginValues>();
  const email = Form.useWatch('email', form);
  const password = Form.useWatch('password', form);
  const [submitting, setSubmitting] = useState(false);

  // гейт кнопки повторяет правило поля формы: короткий пароль не уходит в молчаливый 401
  const canSubmit =
    EMAIL_PATTERN.test(email ?? '') && (password?.length ?? 0) >= PASSWORD_MIN_LENGTH;

  async function handleSubmit(values: LoginValues) {
    setSubmitting(true);
    try {
      const session = await loginRequest(values.email.trim(), values.password);
      applySession(session);
    } catch (error) {
      // бэкенд осознанно не различает «нет такого email» и «неверный пароль» — всегда 401
      message.error(getErrorMessage(error, { 401: 'Неверный email или пароль' }));
    } finally {
      setSubmitting(false);
    }
  }

  return { form, submitting, canSubmit, handleSubmit };
}
