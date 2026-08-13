import type { ChainStatus } from '@entities/chain';

// отказ не всегда ломает цепочку: сервер откатывает её в CANDIDATE, оставляет PROPOSED
// с вакансией под замену или распускает совсем — исход виден только из ответа
const DECLINE_MESSAGE: Partial<Record<ChainStatus, string>> = {
  BROKEN: 'Вы вышли из сделки. Цепочка распалась',
  CANDIDATE: 'Вы вышли из сделки. Цепочка вернулась к сбору откликов',
  PROPOSED: 'Вы вышли из сделки. Участники подбирают замену',
};

export function declineMessage(status: ChainStatus): string {
  return DECLINE_MESSAGE[status] ?? 'Вы вышли из сделки';
}
