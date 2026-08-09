import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Form, Input } from 'antd';

import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH, VALIDATE_DEBOUNCE_MS } from '@shared/lib/validation';

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
        rules={[
          { required: true, message: 'Введите пароль' },
          { min: PASSWORD_MIN_LENGTH, message: 'Пароль должен быть не короче 8 символов' },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="Пароль"
          autoComplete="new-password"
          // сообщение показываем только пока поле в фокусе — уход из поля стирает ошибку.
          // Дебаунс тут не держим: его отложенная проверка сработала бы уже после blur
          // и вернула бы стёртое сообщение (SCRUM-52)
          onBlur={() => form.setFields([{ name: 'password', errors: [] }])}
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
          onBlur={() => form.setFields([{ name: 'confirm', errors: [] }])}
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
