import { useEffect, type ReactNode } from 'react'

import { App as AntApp, ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd'
import ruRU from 'antd/locale/ru_RU'

import { useAppSelector } from '@app/store/hooks'
import type { ThemeMode } from '@app/store/slices/themeSlice'

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
} satisfies ThemeConfig['token']

// colorBgContainer — фон Input/Select/Card (--color-bg-page), colorBgElevated — приподнятые поверхности
// вроде AuthCard/Segmented-трека (--color-bg-card). Перепутанные местами, они гасили контраст
// InputBox на фоне карточки (DESIGN.md §1.9, Penpot InputBox = #FFFFFF на треке #F7F9FC).
const themeTokens: Record<ThemeMode, ThemeConfig['token']> = {
  light: {
    ...baseTokens,
    colorBgLayout: '#FFFFFF',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#F7F9FC',
    colorText: '#000000',
    colorTextSecondary: '#595959',
    colorBorder: '#D9D9D9',
    colorBorderSecondary: '#D9D9D9',
  },
  dark: {
    ...baseTokens,
    colorBgLayout: '#141414',
    colorBgContainer: '#141414',
    colorBgElevated: '#1F1F1F',
    colorText: '#FFFFFF',
    colorTextSecondary: '#A6A6A6',
    colorBorder: '#3A3A3A',
    colorBorderSecondary: '#3A3A3A',
  },
}

const sharedComponents: ThemeConfig['components'] = {
  Button: { fontWeight: 600 },
  // Body 16px из дизайна (§1.4) — antd по умолчанию рисует текст ввода 14px, и он криво центрируется в поле 44px
  Input: { inputFontSize: 16 },
  Segmented: { borderRadius: 8, borderRadiusSM: 4 },
  Card: { borderRadiusLG: 12 },
  Modal: { borderRadiusLG: 12 },
}

// antd для трека берёт colorBgLayout, а для активного сегмента — colorBgElevated, т.е. наоборот макету
// (Penpot: активный seg #FFFFFF на треке #F7F9FC) — без переопределения активный таб сливается с карточкой
const themeComponents: Record<ThemeMode, ThemeConfig['components']> = {
  light: {
    ...sharedComponents,
    Segmented: { ...sharedComponents.Segmented, trackBg: '#F7F9FC', itemSelectedBg: '#FFFFFF' },
  },
  dark: sharedComponents,
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useAppSelector((state) => state.theme.mode)
  const isDark = mode === 'dark'

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = mode
    root.style.colorScheme = mode
  }, [mode])

  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: themeTokens[mode],
        components: themeComponents[mode],
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}
