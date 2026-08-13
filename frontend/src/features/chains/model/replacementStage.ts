import type { ChainStatus } from '@entities/chain';

export type ReplacementStage = 'selecting' | 'waiting' | 'succeeded' | 'rolledBack';

export function replacementStage(
  status: ChainStatus | undefined,
  invited: boolean,
): ReplacementStage {
  if (status === 'PROPOSED') return invited ? 'waiting' : 'selecting';
  if (status === 'FROZEN') return 'succeeded';
  // fallback именно сюда, а не в 'selecting': пул вне PROPOSED не запрашивается, и пустой список
  // с кнопкой «Расформировать цепочку» предложил бы снести живой обмен
  return 'rolledBack';
}
