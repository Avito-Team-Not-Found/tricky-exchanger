import { useState } from 'react';

import { App as AntApp, Form } from 'antd';

import { getErrorMessage } from '@shared/lib/errorMessage';
import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@shared/lib/validation';

import { registerRequest } from '../api/authApi';

import { useApplySession } from './useApplySession';

export interface RegisterValues {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

export function useRegister() {
  const { message } = AntApp.useApp();
  const applySession = useApplySession();
  const [form] = Form.useForm<RegisterValues>();
  const name = Form.useWatch('name', form);
  const email = Form.useWatch('email', form);
  const password = Form.useWatch('password', form);
  const confirm = Form.useWatch('confirm', form);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    !!name?.trim() &&
    EMAIL_PATTERN.test(email ?? '') &&
    (password?.length ?? 0) >= PASSWORD_MIN_LENGTH &&
    !!confirm &&
    confirm === password;

  async function handleSubmit(values: RegisterValues) {
    setSubmitting(true);
    try {
      const session = await registerRequest(
        values.name.trim(),
        values.email.trim(),
        values.password,
      );
      applySession(session);
    } catch (error) {
      message.error(
        getErrorMessage(error, { 409: 'Пользователь с таким email уже зарегистрирован' }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return { form, submitting, canSubmit, handleSubmit };
}
