import { useQuery } from '@tanstack/react-query';

import { fetchChain, fetchExchangeOptions } from './api';

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
