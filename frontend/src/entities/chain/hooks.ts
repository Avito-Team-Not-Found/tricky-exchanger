import { useQueries, useQuery } from '@tanstack/react-query';

import { fetchChain, fetchExchangeOptions } from './api';

// Пока на экране есть цепочка в PROPOSED/FROZEN/IN_PROGRESS, данные обновляются каждые 30с и при
// возврате вкладки: так переход в FROZEN после последнего подтверждения и статусы отправки/
// получения на экране сделки видны без ручного обновления. На COMPLETED опрос не нужен — состояние конечное.
const ACTUALIZATION_MS = 30_000;

function isPollableStatus(status: string | undefined): boolean {
  return status === 'PROPOSED' || status === 'FROZEN' || status === 'IN_PROGRESS';
}

// Опции запроса деталей цепочки вынесены отдельно: на карточках вариантов они нужны для
// нескольких PROPOSED-цепочек сразу (бейдж «N/M согласий» считается из participants[].vote),
// поэтому переиспользуются в useChains
export function chainQueryOptions(chainId?: number) {
  return {
    queryKey: ['chains', chainId],
    queryFn: () => fetchChain(chainId as number),
    enabled: Boolean(chainId),
    refetchInterval: (query: { state: { data?: { status: string } } }) =>
      isPollableStatus(query.state.data?.status) ? ACTUALIZATION_MS : false,
    refetchOnWindowFocus: (query: { state: { data?: { status: string } } }) =>
      isPollableStatus(query.state.data?.status),
  };
}

export function useChain(chainId?: number) {
  return useQuery(chainQueryOptions(chainId));
}

// детали нескольких цепочек сразу (карточки вариантов считают согласия PROPOSED-цепочек
// по участникам); с пустым списком возвращает пустой массив и запросов не делает
export function useChains(chainIds: number[]) {
  return useQueries({ queries: chainIds.map((chainId) => chainQueryOptions(chainId)) });
}

export function useExchangeOptions(offerId?: number) {
  return useQuery({
    queryKey: ['exchange-options', offerId],
    queryFn: () => fetchExchangeOptions(offerId as number),
    enabled: Boolean(offerId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((entry) => entry.status === 'PROPOSED')
        ? ACTUALIZATION_MS
        : false,
    refetchOnWindowFocus: (query) =>
      (query.state.data ?? []).some((entry) => entry.status === 'PROPOSED'),
  });
}
