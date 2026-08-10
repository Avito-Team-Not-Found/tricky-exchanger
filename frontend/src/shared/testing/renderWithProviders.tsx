import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

export interface RenderWithProvidersOptions {
  initialEntries?: string[];
  routes?: { path: string; element: ReactNode }[];
  // свой клиент нужен тестам, которые следят за инвалидацией кеша
  client?: QueryClient;
}

// ui рендерится как catch-all-роут, а routes — как конкретные целевые экраны для проверки навигации
export function renderWithProviders(
  ui: ReactNode,
  { initialEntries = ['/'], routes = [], client }: RenderWithProvidersOptions = {},
): RenderResult {
  const queryClient = client ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="*" element={ui} />
            {routes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>,
  );
}
