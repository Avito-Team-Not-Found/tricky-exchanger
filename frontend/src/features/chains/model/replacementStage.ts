import type { ChainStatus } from '@entities/chain';

export type ReplacementStage = 'selecting' | 'waiting' | 'succeeded' | 'rolledBack';

// Конечный автомат экрана замены (TZ §4): после успешного PUT (invited) статус цепочки из
// GET /chains/{id} решает, что показать. 404 (цепочки нет) ловится отдельно — см.
// useReplacementSelection.
export function replacementStage(
  status: ChainStatus | undefined,
  invited: boolean,
): ReplacementStage {
  if (status === 'PROPOSED') return invited ? 'waiting' : 'selecting';
  if (status === 'FROZEN') return 'succeeded';
  // Всё остальное — не выбор кандидата. Важно, что fallback именно здесь, а не в 'selecting':
  // пул для не-PROPOSED цепочки не запрашивается, поэтому 'selecting' показал бы пустой список
  // с кнопкой «Расформировать цепочку» — то есть предложил бы снести живой обмен IN_PROGRESS.
  return 'rolledBack';
}
