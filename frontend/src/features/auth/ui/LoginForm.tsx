import { useState } from 'react';

import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Form, Input } from 'antd';
import { Link, useNavigate } from 'react-router';

import { useAppDispatch } from '@app/store/hooks';
import { loginSucceeded } from '@app/store/slices/userSlice';

import { getErrorMessage } from '@shared/lib/errorMessage';
import { EMAIL_PATTERN } from '@shared/lib/validation';

import { loginRequest } from '../api/authApi';
import './AuthForms.scss';

interface LoginValues {
  email: string;
  password: string;
}

export function LoginForm() {
  const { message } = AntApp.useApp();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginValues>();
  const email = Form.useWatch('email', form);
  const password = Form.useWatch('password', form);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = EMAIL_PATTERN.test(email ?? '') && !!password;

  async function handleSubmit(values: LoginValues) {
    setSubmitting(true);
    try {
      const session = await loginRequest(values.email.trim(), values.password);
      dispatch(loginSucceeded(session));
      navigate('/products', { replace: true });
    } catch (error) {
      // по 401 показываем нейтральное сообщение, не раскрывая, что именно не совпало
      message.error(getErrorMessage(error, { 401: 'Неверный email или пароль' }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form
      className="auth-form"
      form={form}
      layout="vertical"
      name="login"
      disabled={submitting}
      requiredMark={false}
      onFinish={handleSubmit}
    >
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
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="Пароль"
          autoComplete="current-password"
        />
      </Form.Item>
      <div className="auth-form__forgot">
        <Link to="/forgot-password">Забыли пароль?</Link>
      </div>
      <Button
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={submitting}
        disabled={!canSubmit}
      >
        Войти
      </Button>
    </Form>
  );
}
