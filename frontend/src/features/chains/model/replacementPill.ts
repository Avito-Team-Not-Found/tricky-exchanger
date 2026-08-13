import type { StatusTone } from '@shared/ui';

export interface ReplacementPillMeta {
  text: string;
  tone: StatusTone;
}

const ACTUALITY_DAYS = 14;

// «Актуальность» заявки-кандидата — единственное поле ответа, которое реально различает
// кандидатов: reliability у всех строк выборки одинаковая (TZ §11.3). respondedAt — это
// exchange_offers.updated_at, поэтому честно описывается только давность обновления (TZ §5.3).
// Граница «≤ 14 дней назад» — актуальна, всё старше — давно не обновлялась; будущая дата
// попадает в первую ветку.
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
