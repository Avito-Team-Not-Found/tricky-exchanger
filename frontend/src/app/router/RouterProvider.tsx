import { BrowserRouter } from 'react-router';

import { AppRoutes } from './AppRoutes';

export function RouterProvider() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
