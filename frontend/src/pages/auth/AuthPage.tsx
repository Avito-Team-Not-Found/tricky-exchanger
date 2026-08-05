import { Segmented } from 'antd';
import { useLocation, useNavigate } from 'react-router';

import { LoginForm, RegisterForm } from '@features/auth';

import { AuthLayout } from './AuthLayout';

type AuthMode = 'login' | 'register';

export function AuthPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mode: AuthMode = pathname === '/register' ? 'register' : 'login';

  return (
    <AuthLayout>
      <Segmented
        block
        value={mode}
        onChange={(value) => navigate(value === 'register' ? '/register' : '/login')}
        options={[
          { value: 'login', label: 'Войти' },
          { value: 'register', label: 'Регистрация' },
        ]}
      />
      {mode === 'login' ? <LoginForm /> : <RegisterForm />}
    </AuthLayout>
  );
}
