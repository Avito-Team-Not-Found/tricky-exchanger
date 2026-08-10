import { useRef } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';

import {
  confirmHandoff,
  confirmReceipt,
  sourceParticipant,
  type Chain,
  type FulfillmentResult,
} from '@entities/chain';

import { getErrorMessage } from '@shared/lib/errorMessage';

import { DealSuccessModal } from '../ui/DealSuccessModal';

export type DealFulfillmentKind = 'handoff' | 'receipt';

// Коды ошибок ручек отправки/получения различаются только по 409 (DEAL-PLAN.md §2.2)
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

// Подтверждение отправки и получения — одна мутация на оба действия (AGENTS.md: мутации не
// копипастятся). requestId различается: для handoff — моя заявка (chain.currentRequestId),
// для receipt — заявка звена-источника, чей товар я забираю (DEAL-PLAN.md §2.2). Статусы заявок
// меняются, поэтому инвалидируем и «Мои запросы» (exchange-requests). 409 — не ошибка
// пользователя: тост + перезагрузка данных.
export function useDealFulfillment(chain: Chain) {
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  // модалка успеха живёт в портале вне дерева роутов и сама уход с экрана не переживает
  const success = useRef<{ destroy: () => void } | null>(null);

  const mutation = useMutation<FulfillmentResult, Error, DealFulfillmentKind>({
    mutationFn: (kind) => {
      const requestId =
        kind === 'handoff' ? chain.currentRequestId : (sourceParticipant(chain)?.requestId ?? -1);
      return kind === 'handoff'
        ? confirmHandoff(chain.id, requestId)
        : confirmReceipt(chain.id, requestId);
    },
    onSuccess: (data, kind) => {
      invalidate();
      if (kind === 'receipt') {
        // на завершённой цепочке экран и так перейдёт в «Обмен завершён» — модалка успеха лишняя
        if (data.status === 'COMPLETED') message.success('Обмен завершён');
        else openReceivedModal();
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
    queryClient.invalidateQueries({ queryKey: ['chains'] });
    queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
    queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
  }

  function closeReceivedModal() {
    success.current?.destroy();
    success.current = null;
  }

  function openReceivedModal() {
    success.current = modal.confirm({
      icon: null,
      centered: true,
      width: 311,
      content: (
        <DealSuccessModal
          emoji="🎉"
          title="Получение подтверждено"
          text="Спасибо! Мы отметили, что вы забрали товар. Обмен завершится, как только все участники подтвердят получение."
          onClose={closeReceivedModal}
        />
      ),
      footer: null,
    });
  }

  function run(kind: DealFulfillmentKind) {
    // модалку-подтверждение не показываем ни для отправки, ни для получения: отправку подтверждает
    // обязательное фото упаковки, получение необратимо, но ручки идемпотентны, а повторный клик
    // гасится isPending (DEAL-PLAN §11)
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
