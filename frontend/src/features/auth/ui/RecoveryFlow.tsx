import { ArrowLeftOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Form, Input, Result } from 'antd';
import { Link } from 'react-router';

import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@shared/lib/validation';

import { OTP_LENGTH, useRecoveryFlow } from '../model/useRecoveryFlow';

import './AuthForms.scss';
import './RecoveryFlow.scss';

export function RecoveryFlow() {
  const {
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
  } = useRecoveryFlow();

  const backButton = state.step !== 'success' && (
    <Button
      type="text"
      className="recovery-back"
      icon={<ArrowLeftOutlined aria-hidden />}
      onClick={goBack}
    >
      Назад
    </Button>
  );

  if (state.step === 'email') {
    return (
      <>
        {backButton}
        <h1 className="recovery-title">Восстановление пароля</h1>
        <p className="recovery-description">
          Введите email, указанный при регистрации — мы отправим код для сброса пароля
        </p>
        <Form
          className="auth-form"
          form={emailForm}
          layout="vertical"
          name="recovery-email"
          disabled={state.sending}
          requiredMark={false}
          onFinish={handleSend}
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
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={state.sending}
            disabled={!emailReady}
          >
            Отправить код
          </Button>
          <p className="auth-form__switch-text">
            Вспомнили пароль? <Link to="/login">Войти</Link>
          </p>
        </Form>
      </>
    );
  }

  if (state.step === 'code') {
    const sending = state.action === 'sending';
    const verifying = state.action === 'verifying';

    return (
      <>
        {backButton}
        <h1 className="recovery-title">Введите код</h1>
        <p className="recovery-description">Мы отправили 6-значный код на {state.email}</p>
        <div className="recovery-otp">
          <Input.OTP
            size="large"
            length={OTP_LENGTH}
            value={state.otp}
            status={state.otpInvalid ? 'error' : undefined}
            onChange={setOtp}
            aria-label="Код из 6 цифр"
          />
        </div>
        <p className="recovery-resend">
          Не пришёл код?{' '}
          <button
            type="button"
            className="recovery-resend__link"
            onClick={handleResend}
            disabled={sending}
          >
            Отправить снова
          </button>
        </p>
        <Button
          type="primary"
          size="large"
          block
          loading={verifying}
          disabled={state.otp.length !== OTP_LENGTH}
          onClick={handleVerify}
        >
          Подтвердить
        </Button>
      </>
    );
  }

  if (state.step === 'password') {
    return (
      <>
        {backButton}
        <h1 className="recovery-title">Новый пароль</h1>
        <p className="recovery-description">Придумайте новый пароль для входа</p>
        <Form
          className="auth-form"
          form={passwordForm}
          layout="vertical"
          name="recovery-password"
          disabled={state.resetting}
          requiredMark={false}
          onFinish={handleReset}
        >
          <Form.Item
            label="Новый пароль"
            name="password"
            rules={[{ required: true, message: 'Введите пароль' }]}
            extra={<span className="auth-form__hint">Минимум {PASSWORD_MIN_LENGTH} символов</span>}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Новый пароль"
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
                  if (!value || value === passwordForm.getFieldValue('password')) {
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
            loading={state.resetting}
            disabled={!passwordReady}
          >
            Изменить пароль
          </Button>
        </Form>
      </>
    );
  }

  return (
    <Result
      status="success"
      title="Пароль изменён"
      subTitle="Используйте новый пароль при следующем входе"
      extra={
        <Button type="primary" size="large" onClick={goToLogin}>
          Войти
        </Button>
      }
    />
  );
}
