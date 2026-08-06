import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Form, Input } from 'antd';

import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@shared/lib/validation';

import { useRegister } from '../model/useRegister';

import './AuthForms.scss';

export function RegisterForm() {
  const { form, submitting, canSubmit, handleSubmit } = useRegister();

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
