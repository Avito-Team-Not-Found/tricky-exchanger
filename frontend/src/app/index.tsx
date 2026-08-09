import { useRestoreSession } from '@features/auth';

import { AppProviders } from './providers';
import { RouterProvider } from './router/RouterProvider';

// восстановление сессии — разовое действие при старте приложения (GET /auth/me),
// а не при каждом маунте AppLayout: экран смены пароля лежит вне лейаута и
// при навигации размонтирует/монтирует его заново
function SessionRestorer() {
  useRestoreSession();
  return null;
}

export function App() {
  return (
    <AppProviders>
      <SessionRestorer />
      <RouterProvider />
    </AppProviders>
  );
}
