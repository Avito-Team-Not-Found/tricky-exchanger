import { useRestoreSession } from '@features/auth';

import { AppProviders } from './providers';
import { RouterProvider } from './router/RouterProvider';

// не в AppLayout: экран смены пароля лежит вне лейаута и при навигации монтирует его заново,
// а восстановление сессии должно случиться ровно раз за старт
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
