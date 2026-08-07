import type { GlobalToken } from 'antd';

export type ProbabilityLevel = 'high' | 'medium' | 'low';

export type ProbabilityMeta = {
  label: string;
  token: keyof GlobalToken;
};

export const PROBABILITY_META: Record<ProbabilityLevel, ProbabilityMeta> = {
  high: { label: 'Высокая', token: 'colorSuccess' },
  medium: { label: 'Средняя', token: 'colorWarning' },
  low: { label: 'Низкая', token: 'colorError' },
};

// Уровень вероятности успеха цепочки (DESIGN.md §1.3): пороги взяты из мока (90/72/55)
export function probabilityLevel(score: number): ProbabilityLevel {
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}
