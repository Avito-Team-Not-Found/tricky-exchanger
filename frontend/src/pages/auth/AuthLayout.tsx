import type { ReactNode } from 'react';

import { useLocation } from 'react-router';

import { useAppDispatch, useAppSelector } from '@app/store/hooks';
import { toggleTheme } from '@app/store/slices/themeSlice';

import { useScreenMotionClass } from '@shared/lib/useScreenMotion';
import { BrandLogo, ThemeToggle } from '@shared/ui';
import './authLayout.scss';

export function AuthLayout({ children }: { children: ReactNode }) {
  const isDark = useAppSelector((state) => state.theme.mode) === 'dark';
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const screenMotionClass = useScreenMotionClass();

  return (
    <div className="auth-page">
      <div className="auth-page__theme-toggle">
        <ThemeToggle checked={isDark} onChange={() => dispatch(toggleTheme())} />
      </div>
      <div key={pathname} className={`auth-page__card ${screenMotionClass}`}>
        <BrandLogo />
        {children}
      </div>
    </div>
  );
}
