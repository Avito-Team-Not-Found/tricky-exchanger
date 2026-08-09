import { useQuery } from '@tanstack/react-query';

import { fetchChain, fetchExchangeOptions } from './api';

// Пока на экране есть цепочка в PROPOSED, данные обновляются каждые 30с и при возврате вкладки
// (SOFT-LOCK §9.6): так переход в FROZEN после последнего подтверждения виден без ручного обновления
const ACTUALIZATION_MS = 30_000;

export function useChain(chainId?: number) {
  return useQuery({
    queryKey: ['chains', chainId],
    queryFn: () => fetchChain(chainId as number),
    enabled: Boolean(chainId),
    refetchInterval: (query) =>
      query.state.data?.status === 'PROPOSED' ? ACTUALIZATION_MS : false,
    refetchOnWindowFocus: (query) => query.state.data?.status === 'PROPOSED',
  });
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
