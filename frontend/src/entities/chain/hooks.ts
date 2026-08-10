import { useQueries, useQuery } from '@tanstack/react-query';

import { fetchChain, fetchExchangeOptions, fetchReplacements } from './api';
import { type Chain } from './model';

// Пока на экране есть цепочка в PROPOSED, данные обновляются каждые 30с и при возврате вкладки
// (SOFT-LOCK §9.6): так переход в FROZEN после последнего подтверждения виден без ручного обновления
const ACTUALIZATION_MS = 30_000;

// Опции запроса деталей цепочки вынесены отдельно: на 4.6 они нужны для нескольких PROPOSED-цепочек
// сразу (бейдж «N/M согласий» считается из participants[].vote), поэтому переиспользуются в useChains
export function chainQueryOptions(chainId?: number) {
  return {
    queryKey: ['chains', chainId],
    queryFn: () => fetchChain(chainId as number),
    enabled: Boolean(chainId),
    refetchInterval: (query: { state: { data?: { status: string } } }) =>
      query.state.data?.status === 'PROPOSED' ? ACTUALIZATION_MS : false,
    refetchOnWindowFocus: (query: { state: { data?: { status: string } } }) =>
      query.state.data?.status === 'PROPOSED',
  };
}

export function useChain(
  chainId?: number,
  options: {
    // экран замены ждёт ответа кандидата своим ритмом (15с, TZ §4); остальные экраны
    // довольствуются стандартным опросом 30с по статусу PROPOSED из chainQueryOptions
    refetchInterval?: number | false | ((chain: Chain | undefined) => number | false);
  } = {},
) {
  const { refetchInterval } = options;
  const base = chainQueryOptions(chainId);
  return useQuery({
    ...base,
    refetchInterval:
      refetchInterval === undefined
        ? base.refetchInterval
        : typeof refetchInterval === 'function'
          ? (query) => refetchInterval(query.state.data)
          : refetchInterval,
  });
}

// детали нескольких цепочек сразу (экран 4.6 считает согласия PROPOSED-цепочек по участникам);
// с пустым списком возвращает пустой массив и запросов не делает
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

// Ключ намеренно вложен в ['chains'], чтобы инвалидация по префиксу (useChainVote,
// useReplacementSelection) задевала и пул замен: список кандидатов протухающий (TZ §1).
export function useReplacements(
  chainId?: number,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  return useQuery({
    queryKey: ['chains', chainId, 'replacements'],
    queryFn: () => fetchReplacements(chainId as number),
    enabled: Boolean(chainId) && options.enabled !== false,
    refetchInterval: options.refetchInterval ?? false,
  });
}
