import { useState } from 'react'

import { ArrowLeftOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { App as AntApp, Button, Form, Input, Result } from 'antd'
import { isAxiosError } from 'axios'
import { Link, useNavigate } from 'react-router'

import { getErrorMessage } from '@shared/lib/errorMessage'
import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@shared/lib/validation'

import { resetPassword, sendRecoveryCode, verifyRecoveryCode } from '../api/authApi'
import './AuthForms.scss'
import './RecoveryFlow.scss'

const OTP_LENGTH = 6

type RecoveryStep = 'email' | 'code' | 'password' | 'success'

interface RecoveryEmailValues {
  email: string
}

interface NewPasswordValues {
  password: string
  confirm: string
}

export function RecoveryFlow() {
  const { message } = AntApp.useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState<RecoveryStep>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpInvalid, setOtpInvalid] = useState(false)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [emailForm] = Form.useForm<RecoveryEmailValues>()
  const emailValue = Form.useWatch('email', emailForm)
  const emailReady = EMAIL_PATTERN.test(emailValue ?? '')

  const [passwordForm] = Form.useForm<NewPasswordValues>()
  const newPassword = Form.useWatch('password', passwordForm)
  const confirm = Form.useWatch('confirm', passwordForm)
  const passwordReady =
    (newPassword?.length ?? 0) >= PASSWORD_MIN_LENGTH && !!confirm && confirm === newPassword

  async function handleSend(values: RecoveryEmailValues) {
    setSending(true)
    try {
      await sendRecoveryCode(values.email.trim())
      setEmail(values.email.trim())
      setOtp('')
      setOtpInvalid(false)
      setStep('code')
    } catch (error) {
      message.error(getErrorMessage(error, { 404: 'Пользователь с таким email не найден' }))
    } finally {
      setSending(false)
    }
  }

  async function handleResend() {
    setSending(true)
    try {
      await sendRecoveryCode(email)
      setOtp('')
      setOtpInvalid(false)
      message.success('Код отправлен снова')
    } catch (error) {
      message.error(getErrorMessage(error, {}))
    } finally {
      setSending(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    try {
      await verifyRecoveryCode(email, otp)
      setStep('password')
    } catch (error) {
      // otpInvalid отражает именно «код не подошёл» (400) — не сетевую/прочую ошибку
      const isWrongCode = isAxiosError(error) && error.response?.status === 400
      if (isWrongCode) setOtpInvalid(true)
      message.error(getErrorMessage(error, { 400: 'Неверный или истёкший код' }))
    } finally {
      setVerifying(false)
    }
  }

  async function handleReset(values: NewPasswordValues) {
    setResetting(true)
    try {
      await resetPassword(email, otp, values.password)
      setStep('success')
    } catch (error) {
      message.error(getErrorMessage(error, { 400: 'Неверный или истёкший код' }))
    } finally {
      setResetting(false)
    }
  }

  // на финальном шаге выход только через «Войти», возврат к форме не нужен
  const backButton = step !== 'success' && (
    <Button
      type="text"
      className="recovery-back"
      icon={<ArrowLeftOutlined aria-hidden />}
      onClick={() => navigate('/login')}
    >
      Назад
    </Button>
  )

  if (step === 'email') {
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
          disabled={sending}
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
            loading={sending}
            disabled={!emailReady}
          >
            Отправить код
          </Button>
          <p className="auth-form__switch-text">
            Вспомнили пароль? <Link to="/login">Войти</Link>
          </p>
        </Form>
      </>
    )
  }

  if (step === 'code') {
    return (
      <>
        {backButton}
        <h1 className="recovery-title">Введите код</h1>
        <p className="recovery-description">Мы отправили 6-значный код на {email}</p>
        <div className="recovery-otp">
          <Input.OTP
            size="large"
            length={OTP_LENGTH}
            value={otp}
            status={otpInvalid ? 'error' : undefined}
            onChange={(value) => {
              setOtp(value)
              setOtpInvalid(false)
            }}
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
          disabled={otp.length !== OTP_LENGTH}
          onClick={handleVerify}
        >
          Подтвердить
        </Button>
      </>
    )
  }

  if (step === 'password') {
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
          disabled={resetting}
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
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Пароли не совпадают'))
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
            loading={resetting}
            disabled={!passwordReady}
          >
            Изменить пароль
          </Button>
        </Form>
      </>
    )
  }

  return (
    <Result
      status="success"
      title="Пароль изменён"
      subTitle="Используйте новый пароль при следующем входе"
      extra={
        <Button type="primary" size="large" onClick={() => navigate('/login', { replace: true })}>
          Войти
        </Button>
      }
    />
  )
}
