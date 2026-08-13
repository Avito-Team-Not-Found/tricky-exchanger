import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { ChainStatus } from '@entities/chain';

// запас на расхождение часов клиента и сервера: без него условие freeze_deadline_at <= NOW()
// на бэкенде ещё не выполнится и откат придётся ждать до следующего опроса
const EXPIRY_SLACK_MS = 2_000;

export interface ProposalExpiryState {
  chainId: number;
  listStatus?: ChainStatus;
  detailStatus?: ChainStatus;
  deadlineAt?: string | null;
}

// Просроченный PROPOSED бэкенд откатывает лениво и только в GET /chains/{id}, поэтому список
// вариантов продолжает отдавать PROPOSED с живыми кнопками второго раунда, а подтверждение по
// ним упирается в 410. Хук дёргает деталь в момент дедлайна и инвалидирует список по её переходу.
export function useProposalExpiry(states: ProposalExpiryState[]): void {
  const queryClient = useQueryClient();
  // массив пересобирается на каждом рендере: эффекты вешаем на его значение, а не на ссылку
  const signature = states
    .map((state) =>
      [state.chainId, state.listStatus, state.detailStatus, state.deadlineAt].join(':'),
    )
    .join('|');
  // объявлен первым: эффекты выполняются в порядке объявления, так что ниже ref уже актуален
  const latest = useRef(states);
  useEffect(() => {
    latest.current = states;
  });

  // на экране детали сравнивать не с чем: единственный признак отката — что деталь
  // только что вышла из PROPOSED
  const seenDetail = useRef(new Map<number, ChainStatus>());

  useEffect(() => {
    let stale = false;
    // не some(): он бы оборвал обход на первой протухшей цепочке и не запомнил остальные статусы
    latest.current.forEach((state) => {
      const previous = seenDetail.current.get(state.chainId);
      if (state.detailStatus === undefined) return;
      seenDetail.current.set(state.chainId, state.detailStatus);
      if (state.detailStatus === 'PROPOSED') return;
      if (state.listStatus === 'PROPOSED' || previous === 'PROPOSED') stale = true;
    });
    if (stale) void queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
  }, [signature, queryClient]);

  useEffect(() => {
    const timers = latest.current
      .filter((state) => state.detailStatus === 'PROPOSED')
      .map((state) => {
        const deadline = Date.parse(state.deadlineAt ?? '');
        if (Number.isNaN(deadline)) return undefined;
        // дедлайн мог истечь до монтирования (деталь из кеша) — Math.max не даёт ждать в минус
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
