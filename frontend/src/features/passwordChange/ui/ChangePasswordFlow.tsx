import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';
import { Button, Form, Input } from 'antd';

import { useStepMotionClass } from '@shared/lib/useStepMotion';
import { PASSWORD_MIN_LENGTH } from '@shared/lib/validation';

import { useChangePassword } from '../model/useChangePassword';

import './ChangePasswordFlow.scss';

export function ChangePasswordFlow() {
  const { form, state, canSubmit, handleSubmit, goToProfile } = useChangePassword();
  const stepMotionClass = useStepMotionClass(state.status);

  if (state.status === 'success') {
    return (
      <div key={state.status} className={`password-change-success${stepMotionClass}`}>
        <div className="password-change-success__icon">
          <CheckOutlined aria-hidden />
        </div>
        <h1 className="password-change-success__title">Пароль изменён</h1>
        <p className="password-change-success__description">
          Используйте новый пароль при следующем входе
        </p>
        <Button type="primary" size="large" block onClick={goToProfile}>
          Готово
        </Button>
      </div>
    );
  }

  return (
    <div key={state.status} className={`password-change${stepMotionClass}`}>
      <header className="password-change__header">
        <Button
          type="text"
          className="password-change__back"
          icon={<ArrowLeftOutlined aria-hidden />}
          aria-label="Назад"
          onClick={goToProfile}
        />
        <h1 className="password-change__title">Смена пароля</h1>
      </header>
      <div className="password-change__body">
        <Form
          className="password-change__form"
          form={form}
          layout="vertical"
          name="password-change"
          disabled={state.submitting}
          onFinish={handleSubmit}
        >
          <Form.Item
            label="Текущий пароль"
            name="currentPassword"
            rules={[{ required: true, message: 'Введите текущий пароль' }]}
          >
            <Input.Password placeholder="Текущий пароль" autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label="Новый пароль"
            name="newPassword"
            rules={[
              { required: true, message: 'Введите новый пароль' },
              {
                min: PASSWORD_MIN_LENGTH,
                message: `Минимум ${PASSWORD_MIN_LENGTH} символов`,
              },
            ]}
            extra={
              <span className="password-change__hint">Минимум {PASSWORD_MIN_LENGTH} символов</span>
            }
          >
            <Input.Password placeholder="Новый пароль" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label="Повторите новый пароль"
            name="confirm"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Повторите новый пароль' },
              {
                validator(_, value: string | undefined) {
                  if (!value || value === form.getFieldValue('newPassword')) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Пароли не совпадают'));
                },
              },
            ]}
          >
            <Input.Password placeholder="Пароль ещё раз" autoComplete="new-password" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={state.submitting}
            disabled={!canSubmit}
          >
            Сохранить пароль
          </Button>
        </Form>
      </div>
    </div>
  );
}
