import type { CSSProperties, ReactNode } from 'react';

import { theme, type GlobalToken } from 'antd';

import './ui.scss';

export type StatusTone = 'success' | 'warning' | 'neutral' | 'error';

// Пилюля из токенов темы (DESIGN.md §2.4): фон — статус-цвет на 12% непрозрачности, текст — полный
const TONE_TOKEN: Record<StatusTone, keyof GlobalToken> = {
  success: 'colorSuccess',
  warning: 'colorWarning',
  neutral: 'colorTextSecondary',
  error: 'colorError',
};

export interface StatusTagProps {
  tone: StatusTone;
  children: ReactNode;
}

export function StatusTag({ tone, children }: StatusTagProps) {
  const { token } = theme.useToken();
  const color = token[TONE_TOKEN[tone]] as string;
  const style: CSSProperties = {
    color,
    // заливка статус-цветом на ~12% (DESIGN.md §2.4); hex-alpha вместо color-mix —
    // чтобы фон не пропадал в браузерах без поддержки color-mix
    backgroundColor: `${color}1F`,
  };

  return (
    <span className="status-tag" style={style}>
      {children}
    </span>
  );
}
