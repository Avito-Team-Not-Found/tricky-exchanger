import { useState } from 'react';

import { App as AntApp, Form } from 'antd';
import { useNavigate } from 'react-router';

import { getErrorMessage } from '@shared/lib/errorMessage';
import { PASSWORD_MIN_LENGTH } from '@shared/lib/validation';

import { changePassword } from '../api/passwordChangeApi';

export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

// «форма» и «успех» взаимоисключающие, а submitting валиден только в ветке формы
export type ChangePasswordState = { status: 'form'; submitting: boolean } | { status: 'success' };

export function useChangePassword() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<ChangePasswordValues>();
  const currentPassword = Form.useWatch('currentPassword', form);
  const newPassword = Form.useWatch('newPassword', form);
  const confirm = Form.useWatch('confirm', form);
  const [state, setState] = useState<ChangePasswordState>({ status: 'form', submitting: false });

  const canSubmit =
    !!currentPassword &&
    (newPassword?.length ?? 0) >= PASSWORD_MIN_LENGTH &&
    !!confirm &&
    confirm === newPassword;

  async function handleSubmit(values: ChangePasswordValues) {
    setState({ status: 'form', submitting: true });
    try {
      await changePassword(values.currentPassword, values.newPassword, values.newPassword);
      setState({ status: 'success' });
    } catch (error) {
      // неверный текущий пароль — бизнес-ошибка (400), форма остаётся заполненной для исправления
      message.error(getErrorMessage(error, { 400: 'Неверный текущий пароль' }));
      setState({ status: 'form', submitting: false });
    }
  }

  function goToProfile() {
    navigate('/profile');
  }

  return { form, state, canSubmit, handleSubmit, goToProfile };
}
