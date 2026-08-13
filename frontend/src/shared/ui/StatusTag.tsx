import type { CSSProperties, ReactNode } from 'react';

import { theme, type GlobalToken } from 'antd';

import './ui.scss';

export type StatusTone = 'success' | 'warning' | 'neutral' | 'error';

// нейтральный статус — фиксированный серый: text-secondary в тёмной теме слишком светлый
// для белого текста, контраст упал бы ниже WCAG AA
const NEUTRAL_FILL = '#595959';

const TONE_TOKEN: Partial<Record<StatusTone, keyof GlobalToken>> = {
  success: 'colorSuccess',
  warning: 'colorWarning',
  error: 'colorError',
};

export interface StatusTagProps {
  tone: StatusTone;
  children: ReactNode;
}

export function StatusTag({ tone, children }: StatusTagProps) {
  const { token } = theme.useToken();
  const backgroundColor =
    tone === 'neutral' ? NEUTRAL_FILL : (token[TONE_TOKEN[tone] as keyof GlobalToken] as string);
  const style: CSSProperties = { color: '#FFFFFF', backgroundColor };

  return (
    <span className="status-tag" style={style}>
      {children}
    </span>
  );
}
