import { useState } from 'react';

import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Form, Input } from 'antd';
import { useNavigate } from 'react-router';

import { useAppDispatch } from '@app/store/hooks';
import { loginSucceeded } from '@app/store/slices/userSlice';

import { getErrorMessage } from '@shared/lib/errorMessage';
import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@shared/lib/validation';

import { registerRequest } from '../api/authApi';
import './AuthForms.scss';

interface RegisterValues {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

export function RegisterForm() {
  const { message } = AntApp.useApp();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [form] = Form.useForm<RegisterValues>();
  const name = Form.useWatch('name', form);
  const email = Form.useWatch('email', form);
  const password = Form.useWatch('password', form);
  const confirm = Form.useWatch('confirm', form);
  const [submitting, setSubmitting] = useState(false);

  // паттерн должен совпадать с правилом валидации поля, чтобы кнопка и Form не расходились
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
      dispatch(loginSucceeded(session));
      navigate('/products', { replace: true });
    } catch (error) {
      // регистрация никогда не отвечает 401 (см. mock/server.js) — только 400/409
      message.error(
        getErrorMessage(error, { 409: 'Пользователь с таким email уже зарегистрирован' }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form
      className="auth-form"
      form={form}
      layout="vertical"
      name="register"
      disabled={submitting}
      requiredMark={false}
      onFinish={handleSubmit}
    >
      <Form.Item
        label="Имя"
        name="name"
        rules={[{ required: true, whitespace: true, message: 'Введите имя' }]}
      >
        <Input prefix={<UserOutlined />} placeholder="Имя" autoComplete="name" />
      </Form.Item>
      <Form.Item
        label="Email"
        name="email"
        rules={[
          { required: true, message: 'Введите email' },
          { pattern: EMAIL_PATTERN, message: 'Некорректный email' },
        ]}
      >
        <Input prefix={<MailOutlined />} placeholder="you@example.com" autoComplete="email" />
      </Form.Item>
      <Form.Item
        label="Пароль"
        name="password"
        rules={[{ required: true, message: 'Введите пароль' }]}
        extra={<span className="auth-form__hint">Минимум {PASSWORD_MIN_LENGTH} символов</span>}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="Пароль"
          autoComplete="new-password"
        />
      </Form.Item>
      <Form.Item
        label="Повторите пароль"
        name="confirm"
        dependencies={['password']}
        rules={[
          { required: true, message: 'Повторите пароль' },
          {
            validator(_, value: string | undefined) {
              if (!value || value === form.getFieldValue('password')) {
                return Promise.resolve();
              }
              return Promise.reject(new Error('Пароли не совпадают'));
            },
          },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="Пароль ещё раз"
          autoComplete="new-password"
        />
      </Form.Item>
      <Button
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={submitting}
        disabled={!canSubmit}
      >
        Зарегистрироваться
      </Button>
    </Form>
  );
}
