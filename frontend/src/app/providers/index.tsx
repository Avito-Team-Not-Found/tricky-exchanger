import type { ReactNode } from 'react';

import { QueryProvider } from './QueryProvider';
import { ReduxProvider } from './ReduxProvider';
import { ThemeProvider } from './ThemeProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ReduxProvider>
      <QueryProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryProvider>
    </ReduxProvider>
  );
}
