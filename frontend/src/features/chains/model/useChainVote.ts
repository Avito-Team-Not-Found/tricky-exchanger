import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';

import { voteForRequest, withdrawVote, type ChainVoteResult } from '@entities/chain';

import { getErrorMessage } from '@shared/lib/errorMessage';

export interface VoteTarget {
  chainId: number;
  requestId: number;
  targetRequestId: number;
}

// Отклик на конкретную заявку следующего звена — одна мутация-тумблер (PROJECT.md §4.5):
// PUT ставит отклик, DELETE снимает. Когда кольцо откликов замыкается, цепочку переводит
// в PROPOSED сам бэкенд — статус читаем из ответа и инвалидируем кэш, иначе экран покажет
// устаревшие действия и словит 409.
export function useChainVote(onConflict?: () => void) {
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();

  const mutation = useMutation<ChainVoteResult | void, Error, VoteTarget & { active: boolean }>({
    mutationFn: ({
      chainId,
      requestId,
      targetRequestId,
      active,
    }: VoteTarget & { active: boolean }) =>
      active
        ? voteForRequest(chainId, { requestId, targetRequestId })
        : withdrawVote(chainId, { requestId, targetRequestId }),
    onSuccess: (data, { active }) => {
      if (!active) {
        message.success('Отклик отозван');
      } else if (data?.chainStatus === 'PROPOSED') {
        message.success('Цепочка собрана');
      } else {
        message.success('Отклик отправлен');
      }
      // и список вариантов, и открытая карточка цепочки показывают свежие статусы откликов
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
    },
    onError: (error) => {
      // статус цепочки мог устареть (например, кольцо замкнул кто-то другой) — перезагружаем данные
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
      message.error(
        getErrorMessage(
          error,
          {
            403: 'Это не ваша заявка',
            404: 'Цепочка не найдена',
            409: 'Цепочка изменилась: обновите варианты',
            422: 'Некорректный вариант обмена',
          },
          'Не удалось отправить отклик',
        ),
      );
      onConflict?.();
    },
  });

  // отклик обратим, поэтому подтверждение нужно только на его отзыве (DESIGN.md §2.8)
  function confirmVote(target: VoteTarget, active: boolean) {
    if (active) {
      mutation.mutate({ ...target, active: true });
      return;
    }
    modal.confirm({
      title: 'Отозвать отклик?',
      content: 'Отклик будет снят, цепочка вернётся в список вариантов.',
      okText: 'Да, отозвать',
      okButtonProps: { danger: true },
      cancelText: 'Нет',
      onOk: () => mutation.mutate({ ...target, active: false }),
    });
  }

  return { confirmVote, isVoting: mutation.isPending };
}
