import { useQuery } from '@tanstack/react-query';

import { fetchChain, fetchExchangeOptions, fetchReplacements } from './api';
import { bestChainId, type Chain } from './model';

// refetchInterval можно задать функцией от самой цепочки: опрос обычно нужно включать по её
// статусу (экран замены ждёт ответа кандидата, пока цепочка PROPOSED), а до первого ответа
// статуса ещё нет — снаружи это выражается только через хранение копии данных в state.
export function useChain(
  chainId?: number,
  options: {
    refetchInterval?: number | false | ((chain: Chain | undefined) => number | false);
  } = {},
) {
  const { refetchInterval } = options;
  return useQuery({
    queryKey: ['chains', chainId],
    queryFn: () => fetchChain(chainId as number),
    enabled: Boolean(chainId),
    refetchInterval:
      typeof refetchInterval === 'function'
        ? (query) => refetchInterval(query.state.data)
        : refetchInterval,
  });
}

export function useExchangeOptions(offerId?: number) {
  return useQuery({
    queryKey: ['exchange-options', offerId],
    queryFn: () => fetchExchangeOptions(offerId as number),
    enabled: Boolean(offerId),
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

// Ключ намеренно вложен в ['chains'], чтобы инвалидация по префиксу (useChainVote,
// useReplacementSelection) задевала и пул замен: список кандидатов протухающий (TZ §1).
export function useReplacements(chainId?: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['chains', chainId, 'replacements'],
    queryFn: () => fetchReplacements(chainId as number),
    enabled: Boolean(chainId) && options.enabled !== false,
  });
}
