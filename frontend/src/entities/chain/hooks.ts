import { useQuery } from '@tanstack/react-query';

import { fetchChain, fetchExchangeOptions } from './api';
import { bestChainId, type Chain } from './model';

export function useChain(chainId?: number) {
  return useQuery({
    queryKey: ['chains', chainId],
    queryFn: () => fetchChain(chainId as number),
    enabled: Boolean(chainId),
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
