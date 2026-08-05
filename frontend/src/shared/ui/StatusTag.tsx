import type { ReactNode } from 'react'

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'

import './ui.scss'

type Tone = 'success' | 'warning' | 'error' | 'neutral'

export type StatusTagKey =
  'active' | 'reserved' | 'exchanged' | 'in_progress' | 'completed' | 'cancelled'

const STATUS_META: Record<StatusTagKey, { label: string; tone: Tone; icon: ReactNode }> = {
  active: { label: 'Активен', tone: 'success', icon: <CheckCircleOutlined /> },
  reserved: { label: 'Забронирован', tone: 'warning', icon: <ClockCircleOutlined /> },
  exchanged: { label: 'Обменян', tone: 'success', icon: <CheckCircleOutlined /> },
  in_progress: { label: 'В процессе', tone: 'warning', icon: <ClockCircleOutlined /> },
  completed: { label: 'Завершён', tone: 'neutral', icon: <CheckCircleOutlined /> },
  cancelled: { label: 'Отменён', tone: 'error', icon: <CloseCircleOutlined /> },
}

// сервер может отдать статус вне контракта — рендер не должен падать из-за неизвестного значения
const UNKNOWN_META: { label: string; tone: Tone; icon: ReactNode } = {
  label: 'Неизвестный статус',
  tone: 'neutral',
  icon: <QuestionCircleOutlined />,
}

interface StatusTagProps {
  status: StatusTagKey
  className?: string
}

export function StatusTag({ status, className = '' }: StatusTagProps) {
  const meta = STATUS_META[status] ?? UNKNOWN_META
  return (
    <span className={`status-tag status-tag--${meta.tone} ${className}`.trim()}>
      <span className="status-tag__icon">{meta.icon}</span>
      {meta.label}
    </span>
  )
}
