import { useQueries, useQuery } from '@tanstack/react-query';

import { fetchChain, fetchExchangeOptions } from './api';
import { bestChainId, type Chain } from './model';

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

export function useChain(chainId?: number) {
  return useQuery(chainQueryOptions(chainId));
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

// Лучшая ли цепочка среди вариантов своей заявки. На экраны цепочки приходят со списка
// «Варианты обмена», где список вариантов уже осел в кеше, — тогда ответ готов сразу. При заходе
// по прямой ссылке он догружается, и экран ждёт его вместе с самой цепочкой (isLoading), иначе
// плашка появлялась бы после отрисовки и сдвигала вниз уже прочитанное содержимое.
export function useIsBestChain(chain?: Chain): { isBest: boolean; isLoading: boolean } {
  const { data, isLoading } = useExchangeOptions(chain?.currentRequestId);
  return {
    isBest: chain ? bestChainId(data ?? []) === chain.id : false,
    isLoading,
  };
}
