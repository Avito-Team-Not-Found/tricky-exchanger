import { RecoveryFlow } from '@features/auth';

import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <RecoveryFlow />
    </AuthLayout>
  );
}
