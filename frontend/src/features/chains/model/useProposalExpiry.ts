import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { ChainStatus } from '@entities/chain';

// запас на расхождение часов клиента и сервера: деталь дёргаем чуть позже дедлайна, иначе
// ExpireProposalIfDue (условие freeze_deadline_at <= NOW()) ещё не сработает и откат придётся
// ждать до следующего 30-секундного опроса
const EXPIRY_SLACK_MS = 2_000;

export interface ProposalExpiryState {
  chainId: number;
  // статус из exchange-options — именно он определяет кнопки второго раунда на карточке
  listStatus: ChainStatus;
  // статус и дедлайн из детали (GET /chains/{id}); undefined — деталь ещё не пришла
  detailStatus?: ChainStatus;
  deadlineAt?: string | null;
}

// Просроченный PROPOSED бэкенд откатывает лениво и только в GET /chains/{id}
// (service/chain: Get → ExpireProposalIfDue); ListForOffer этого не делает, поэтому
// exchange-options продолжает отдавать PROPOSED, пока список не перезапросят. Без синхронизации
// карточка 4.6 после дедлайна теряет таймер (деталь уже CANDIDATE, freezeDeadlineAt очищен),
// но сохраняет «Требуются действия»/«Да» — и подтверждение упирается в 410.
// Хук закрывает обе половины: в момент дедлайна дёргает деталь (её ответ и выполнит откат),
// а как только деталь ушла из PROPOSED — инвалидирует список.
export function useProposalExpiry(states: ProposalExpiryState[]): void {
  const queryClient = useQueryClient();
  // массив пересобирается на каждом рендере: эффекты вешаем на его значение, а не на ссылку
  const signature = states
    .map((state) =>
      [state.chainId, state.listStatus, state.detailStatus, state.deadlineAt].join(':'),
    )
    .join('|');
  // эффекты просыпаются только на смену signature, но работать должны со свежим массивом;
  // объявлен первым — эффекты выполняются в порядке объявления, так что ниже ref уже актуален
  const latest = useRef(states);
  useEffect(() => {
    latest.current = states;
  });

  useEffect(() => {
    const stale = latest.current.some(
      (state) =>
        state.listStatus === 'PROPOSED' &&
        state.detailStatus !== undefined &&
        state.detailStatus !== 'PROPOSED',
    );
    if (stale) void queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
  }, [signature, queryClient]);

  useEffect(() => {
    const timers = latest.current
      .filter((state) => state.listStatus === 'PROPOSED' && state.detailStatus === 'PROPOSED')
      .map((state) => {
        const deadline = Date.parse(state.deadlineAt ?? '');
        if (Number.isNaN(deadline)) return undefined;
        // уже просроченный дедлайн (деталь из кеша) — дёргаем сразу, Math.max не даёт ждать в минус
        const delay = Math.max(0, deadline - Date.now()) + EXPIRY_SLACK_MS;
        return setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ['chains', state.chainId] });
        }, delay);
      });
    return () => {
      timers.forEach((timer) => {
        if (timer !== undefined) clearTimeout(timer);
      });
    };
  }, [signature, queryClient]);
}
