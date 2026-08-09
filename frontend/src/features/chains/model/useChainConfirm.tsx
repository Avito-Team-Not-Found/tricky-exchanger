import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { isAxiosError } from 'axios';

import { confirmChain, type ConfirmResult } from '@entities/chain';

import { getErrorMessage } from '@shared/lib/errorMessage';

import { FreezeDecisionModal } from '../ui/FreezeDecisionModal';

// Подтверждение участия во втором раунде (SOFT-LOCK §6, §10) — единая точка для 4.6/4.7/4.8:
// модалка «Готовность к сделке» + POST /chains/{id}/confirm. Статус из ответа решает тост:
// PROPOSED — ждём остальных, FROZEN — сделка подтверждена. Любая ошибка инвалидирует кэш,
// чтобы карточки не остались с устаревшими действиями, и перезагружает данные.
export function useChainConfirm(refetch?: () => void, onNotFound?: () => void) {
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();

  const mutation = useMutation<ConfirmResult, Error, number>({
    mutationFn: (chainId) => confirmChain(chainId),
    onSuccess: (data) => {
      message.success(data.status === 'FROZEN' ? 'Сделка подтверждена' : 'Участие подтверждено');
      invalidate();
    },
    onError: (error) => {
      invalidate();
      if (isAxiosError(error) && error.response?.status === 404) onNotFound?.();
      message.error(
        getErrorMessage(
          error,
          {
            403: 'Вы не участник этой цепочки',
            404: 'Цепочка не найдена',
            409: 'Цепочка изменилась: обновите варианты',
          },
          'Не удалось подтвердить участие',
        ),
      );
      refetch?.();
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['chains'] });
    queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
  }

  function openConfirm(chainId: number) {
    // instance нужен, чтобы закрыть модалку после ответа сервера из контента (FreezeDecisionModal)
    let instance: { destroy: () => void } | null = null;
    instance = modal.confirm({
      icon: null,
      centered: true,
      width: 280,
      content: (
        <FreezeDecisionModal
          onConfirm={async () => {
            await mutation.mutateAsync(chainId);
          }}
          onClose={() => instance?.destroy()}
        />
      ),
      footer: null,
    });
  }

  return { openConfirm };
}
