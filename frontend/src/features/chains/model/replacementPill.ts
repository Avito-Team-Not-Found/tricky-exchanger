import type { StatusTone } from '@shared/ui';

export interface ReplacementPillMeta {
  text: string;
  tone: StatusTone;
}

const ACTUALITY_DAYS = 14;

// reliability у всех кандидатов выборки одинаковая, так что различает их только respondedAt —
// и это exchange_offers.updated_at, то есть честно описывается лишь давность обновления
export function replacementPillMeta(
  respondedAt: string,
  now: Date = new Date(),
): ReplacementPillMeta {
  const responded = new Date(respondedAt).getTime();
  const withinActuality = responded >= now.getTime() - ACTUALITY_DAYS * 24 * 60 * 60 * 1000;
  return withinActuality
    ? { text: 'Актуальна', tone: 'success' }
    : { text: 'Давно не обновлялась', tone: 'warning' };
}
