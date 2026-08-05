import { useEffect, type ReactNode } from 'react';

import { App as AntApp, ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd';
import ruRU from 'antd/locale/ru_RU';

import { useAppSelector } from '@app/store/hooks';
import type { ThemeMode } from '@app/store/slices/themeSlice';

// значения совпадают с tokens.scss — при изменении палитры править оба места
const baseTokens = {
  colorPrimary: '#1677FF',
  colorSuccess: '#52C41A',
  colorWarning: '#FAAD14',
  colorError: '#FF4D4F',
  borderRadius: 8,
  borderRadiusLG: 12,
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  controlHeight: 44,
  controlHeightLG: 52,
} satisfies ThemeConfig['token'];

const themeTokens: Record<ThemeMode, ThemeConfig['token']> = {
  light: {
    ...baseTokens,
    colorBgLayout: '#FFFFFF',
    colorBgContainer: '#F7F9FC',
    colorText: '#000000',
    colorTextSecondary: '#595959',
    colorBorder: '#D9D9D9',
    colorBorderSecondary: '#D9D9D9',
  },
  dark: {
    ...baseTokens,
    colorBgLayout: '#141414',
    colorBgContainer: '#1F1F1F',
    colorText: '#FFFFFF',
    colorTextSecondary: '#A6A6A6',
    colorBorder: '#3A3A3A',
    colorBorderSecondary: '#3A3A3A',
  },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useAppSelector((state) => state.theme.mode);
  const isDark = mode === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
  }, [mode]);

  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: themeTokens[mode],
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
