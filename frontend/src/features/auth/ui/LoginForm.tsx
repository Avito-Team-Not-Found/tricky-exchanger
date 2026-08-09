import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Form, Input } from 'antd';
import { Link } from 'react-router';

import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH, VALIDATE_DEBOUNCE_MS } from '@shared/lib/validation';

import { useLogin } from '../model/useLogin';

import './AuthForms.scss';

export function LoginForm() {
  const { form, submitting, canSubmit, handleSubmit } = useLogin();

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
        validateDebounce={VALIDATE_DEBOUNCE_MS}
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
        validateDebounce={VALIDATE_DEBOUNCE_MS}
        rules={[
          { required: true, message: 'Введите пароль' },
          { min: PASSWORD_MIN_LENGTH, message: 'Пароль должен быть не короче 8 символов' },
        ]}
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
