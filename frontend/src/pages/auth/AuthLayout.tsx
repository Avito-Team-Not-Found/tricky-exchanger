import type { ReactNode } from 'react';

import { useAppDispatch, useAppSelector } from '@app/store/hooks';
import { toggleTheme } from '@app/store/slices/themeSlice';

import { BrandLogo, ThemeToggle } from '@shared/ui';
import './authLayout.scss';

export function AuthLayout({ children }: { children: ReactNode }) {
  const isDark = useAppSelector((state) => state.theme.mode) === 'dark';
  const dispatch = useAppDispatch();

  return (
    <div className="auth-page">
      <div className="auth-page__theme-toggle">
        <ThemeToggle checked={isDark} onChange={() => dispatch(toggleTheme())} />
      </div>
      <div className="auth-page__card">
        <BrandLogo />
        {children}
      </div>
    </div>
  );
}
