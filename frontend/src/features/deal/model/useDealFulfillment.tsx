import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';

import {
  confirmHandoff,
  confirmReceipt,
  invalidateChainQueries,
  sourceParticipant,
  type Chain,
  type FulfillmentResult,
} from '@entities/chain';

import { getErrorMessage } from '@shared/lib/errorMessage';

export type DealFulfillmentKind = 'handoff' | 'receipt';

// Коды ошибок ручек отправки/получения различаются только по 409
const HANDOFF_ERROR_MESSAGES: Record<number, string> = {
  404: 'Цепочка не найдена',
  409: 'Цепочка ещё не готова к передаче товаров',
  422: 'Заявка не является закреплённым товаром этой цепочки',
};

const RECEIPT_ERROR_MESSAGES: Record<number, string> = {
  403: 'Только получатель товара может подтвердить получение',
  404: 'Цепочка не найдена',
  409: 'Передача товара ещё не подтверждена',
  422: 'Заявка не является закреплённым товаром этой цепочки',
};

// одна мутация на оба действия, различается только requestId: для handoff — моя заявка,
// для receipt — заявка звена-источника, чей товар я забираю
export function useDealFulfillment(chain: Chain) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();

  const mutation = useMutation<FulfillmentResult, Error, DealFulfillmentKind>({
    mutationFn: (kind) => {
      if (kind === 'handoff') return confirmHandoff(chain.id, chain.currentRequestId);
      const source = sourceParticipant(chain);
      // не должно случиться: кнопку получения UI держит заблокированной, пока источник не IN_PROGRESS
      if (!source) return Promise.reject(new Error('Источник товара не найден'));
      return confirmReceipt(chain.id, source.requestId);
    },
    onSuccess: (data, kind) => {
      invalidate();
      if (kind === 'receipt') {
        // после подтверждения получения экран сам перейдёт в «Вы забрали товар» — модалка успеха
        // не нужна; на завершённой цепочке он перейдёт в «Обмен завершён»
        if (data.status === 'COMPLETED') message.success('Обмен завершён');
        return;
      }
      message.success('Отправка подтверждена');
    },
    onError: (error, kind) => {
      invalidate();
      message.error(
        getErrorMessage(
          error,
          kind === 'handoff' ? HANDOFF_ERROR_MESSAGES : RECEIPT_ERROR_MESSAGES,
          'Не удалось подтвердить операцию',
        ),
      );
    },
  });

  function invalidate() {
    invalidateChainQueries(queryClient);
  }

  function run(kind: DealFulfillmentKind) {
    // модалку-подтверждение не показываем ни для отправки, ни для получения: отправку подтверждает
    // обязательное фото упаковки, получение необратимо, но ручки идемпотентны, а повторный клик
    // гасится isPending
    mutation.mutateAsync(kind).then(
      () => undefined,
      () => undefined,
    );
  }

  return {
    confirmHandoff: () => run('handoff'),
    confirmReceipt: () => run('receipt'),
    isFulfilling: mutation.isPending,
  };
}
