import { useRef } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { isAxiosError } from 'axios';

import {
  confirmChain,
  declineChain,
  thinkChain,
  type ChainStatus,
  type ConfirmResult,
  type DeclineResult,
  type ThinkResult,
} from '@entities/chain';

import { getErrorMessage } from '@shared/lib/errorMessage';

import { FreezeDecisionModal } from '../ui/FreezeDecisionModal';
import { ThinkDecisionModal } from '../ui/ThinkDecisionModal';

// Отказ не всегда ломает цепочку: сервер откатывает её в CANDIDATE, оставляет PROPOSED
// с вакансией под замену или распускает совсем (SOFT-LOCK §3.2) — исход виден только из ответа
const DECLINE_MESSAGE: Partial<Record<ChainStatus, string>> = {
  BROKEN: 'Вы вышли из сделки. Цепочка распалась',
  CANDIDATE: 'Вы вышли из сделки. Цепочка вернулась к сбору откликов',
  PROPOSED: 'Вы вышли из сделки. Участники подбирают замену',
};

// Подтверждение участия во втором раунде (SOFT-LOCK §6, §10) — единая точка для 4.6/4.7/4.8:
// модалка «Готовность к сделке» + POST /chains/{id}/confirm. Статус из ответа решает тост:
// PROPOSED — ждём остальных, FROZEN — сделка подтверждена. Отказ («Нет») идёт через отдельное
// подтверждение (§6.3) и POST /chains/{id}/decline. Любая ошибка инвалидирует кэш,
// чтобы карточки не остались с устаревшими действиями, и перезагружает данные.
export function useChainConfirm(refetch?: () => void, onNotFound?: () => void) {
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  // модалка живёт в портале вне дерева роутов: сама она уход с экрана не переживает, её надо
  // закрывать руками, иначе останется висеть поверх нового экрана с живой кнопкой «Да»
  const decision = useRef<{ destroy: () => void } | null>(null);

  const mutation = useMutation<ConfirmResult, Error, number>({
    mutationFn: (chainId) => confirmChain(chainId),
    onSuccess: (data) => {
      message.success(data.status === 'FROZEN' ? 'Сделка подтверждена' : 'Участие подтверждено');
      invalidate();
    },
    onError: (error) => handleError(error, 'Не удалось подтвердить участие'),
  });

  const thinkMutation = useMutation<ThinkResult, Error, number>({
    mutationFn: (chainId) => thinkChain(chainId),
    // тоста нет: результат виден на карточке (§5.2), предвосхищать серверный голос нельзя
    onSuccess: () => {
      invalidate();
    },
    onError: (error) => handleError(error, 'Не удалось отложить решение'),
  });

  const declineMutation = useMutation<DeclineResult, Error, number>({
    mutationFn: (chainId) => declineChain(chainId),
    onSuccess: (data) => {
      message.success(DECLINE_MESSAGE[data.status] ?? 'Вы вышли из сделки');
      invalidate();
      // цепочки больше нет — на 4.7/4.8 остаться на её экране нельзя
      if (data.status === 'BROKEN') {
        closeDecision();
        onNotFound?.();
      }
    },
    onError: (error) => handleError(error, 'Не удалось отказаться от участия'),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['chains'] });
    queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
  }

  function closeDecision() {
    decision.current?.destroy();
    decision.current = null;
  }

  function handleError(error: Error, fallback: string) {
    invalidate();
    // дедлайн истёк: цепочку откатил сервер, подтверждать нечего — предупреждение и перезагрузка,
    // карточка перерисуется в статус, который вернул бэкенд (SOFT-LOCK §10.1)
    if (isAxiosError(error) && error.response?.status === 410) {
      closeDecision();
      message.warning('Время на ответ истекло, цепочка распалась');
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
    // цепочки нет — решать по ней больше нечего: закрываем модалку и уходим к списку,
    // перезагружать данные удалённой цепочки уже некому
    if (isAxiosError(error) && error.response?.status === 404) {
      closeDecision();
      onNotFound?.();
      return;
    }
    refetch?.();
  }

  // отказ необратим и меняет судьбу всей цепочки, поэтому подтверждается отдельно (SOFT-LOCK §6.3);
  // какой из трёх исходов случится, клиент заранее не знает — формулировка обтекаемая
  function openDecline(chainId: number) {
    modal.confirm({
      title: 'Отказаться от сделки?',
      content:
        'Ваш товар вернётся в другие варианты обмена, а цепочка распадётся или будет пересобрана.',
      okText: 'Да, отказаться',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      centered: true,
      // reject гасится здесь: antd пробрасывает его наружу необработанным, а про ошибку уже
      // рассказал тост мутации — модалка закрывается, решение остаётся за модалкой §6.1
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
          onThink={() => openThink(chainId)}
          onClose={closeDecision}
        />
      ),
      footer: null,
    });
  }

  // «Пока вы думаете» (SOFT-LOCK §6.2): отдельная модалка поверх первой; «Вернуться» возвращает
  // к «Готовность к сделке», а не просто закрывает её — решение по цепочке ещё не принято
  function openThink(chainId: number) {
    closeDecision();
    decision.current = modal.confirm({
      icon: null,
      centered: true,
      width: 280,
      content: (
        <ThinkDecisionModal
          onConfirm={async () => {
            await thinkMutation.mutateAsync(chainId);
          }}
          onBack={() => openConfirm(chainId)}
          onClose={closeDecision}
        />
      ),
      footer: null,
    });
  }

  return {
    openConfirm,
    // «Да» на карточке в режиме «подумаю» подтверждает без повторной модалки (SOFT-LOCK §5.2)
    confirmNow: (chainId: number) => mutation.mutate(chainId),
    openDecline,
    isConfirming: mutation.isPending,
  };
}
