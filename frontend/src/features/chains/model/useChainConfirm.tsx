import { useRef } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { isAxiosError } from 'axios';

import {
  confirmChain,
  declineChain,
  invalidateChainQueries,
  type ConfirmResult,
  type DeclineResult,
} from '@entities/chain';

import { getErrorMessage } from '@shared/lib/errorMessage';

import { FreezeDecisionModal } from '../ui/FreezeDecisionModal';

import { declineMessage } from './declineMessage';
import { EXPIRED_CHAIN_MESSAGE, isChainExpired } from './expiredChain';

type ChainConfirmOptions = {
  // страницы с ExpiredChainState сами показывают истечение — тост её продублировал бы
  suppressExpiryToast?: boolean;
};

export function useChainConfirm(
  refetch?: () => void,
  onNotFound?: () => void,
  { suppressExpiryToast = false }: ChainConfirmOptions = {},
) {
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  // модалка живёт в портале вне дерева роутов — иначе останется висеть поверх нового экрана
  // с живой кнопкой «Да»
  const decision = useRef<{ destroy: () => void } | null>(null);
  // отказ из FROZEN завершает для нас цепочку при любом исходе: товар высвобожден, цепочка ушла
  // под быструю замену или распалась — флаг переносит переход в общий onSuccess мутации
  const declineFromFrozen = useRef(false);

  const mutation = useMutation<ConfirmResult, Error, number>({
    mutationFn: (chainId) => confirmChain(chainId),
    onSuccess: (data) => {
      message.success(
        data.status === 'FROZEN'
          ? 'Сделка подтверждена. Письмо придёт на почту'
          : 'Участие подтверждено',
      );
      invalidate();
    },
    onError: (error) => handleError(error, 'Не удалось подтвердить участие'),
  });

  const declineMutation = useMutation<DeclineResult, Error, number>({
    mutationFn: (chainId) => declineChain(chainId),
    onSuccess: (data) => {
      message.success(declineMessage(data.status));
      invalidate();
      if (data.status === 'BROKEN' || declineFromFrozen.current) {
        closeDecision();
        onNotFound?.();
      }
    },
    onError: (error) => handleError(error, 'Не удалось отказаться от участия'),
  });

  function invalidate() {
    invalidateChainQueries(queryClient);
  }

  function closeDecision() {
    decision.current?.destroy();
    decision.current = null;
  }

  function handleError(error: Error, fallback: string) {
    invalidate();
    if (isChainExpired(error)) {
      closeDecision();
      if (!suppressExpiryToast) message.warning(EXPIRED_CHAIN_MESSAGE);
      refetch?.();
      return;
    }
    message.error(
      getErrorMessage(
        error,
        {
          403: 'Вы не участник этой цепочки',
          404: 'Цепочка не найдена',
          409: 'Цепочка изменилась: обновите варианты',
        },
        fallback,
      ),
    );
    // перезагружать данные удалённой цепочки уже некому
    if (isAxiosError(error) && error.response?.status === 404) {
      closeDecision();
      onNotFound?.();
      return;
    }
    refetch?.();
  }

  // какой из трёх исходов случится, клиент заранее не знает — формулировка обтекаемая
  function openDecline(chainId: number, fromFrozen = false) {
    declineFromFrozen.current = fromFrozen;
    modal.confirm({
      title: 'Отказаться от сделки?',
      content:
        'Ваш товар вернётся в другие варианты обмена, а цепочка распадётся или будет пересобрана.',
      okText: 'Да, отказаться',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      centered: true,
      // reject гасится здесь: antd пробрасывает его наружу необработанным, а про ошибку уже
      // рассказал тост мутации
      onOk: () => declineMutation.mutateAsync(chainId).then(closeDecision, () => {}),
    });
  }

  function openConfirm(chainId: number) {
    decision.current = modal.confirm({
      icon: null,
      centered: true,
      width: 280,
      content: (
        <FreezeDecisionModal
          onConfirm={async () => {
            await mutation.mutateAsync(chainId);
          }}
          onDecline={() => openDecline(chainId)}
          onClose={closeDecision}
        />
      ),
      footer: null,
    });
  }

  return { openConfirm, openDecline };
}
