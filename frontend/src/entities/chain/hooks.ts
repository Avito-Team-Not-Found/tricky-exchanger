import { useQuery } from '@tanstack/react-query';

import { fetchChain, fetchRequestChains } from './api';

export function useRequestChains(requestId?: string) {
  return useQuery({
    queryKey: ['chains', 'request', requestId],
    queryFn: () => fetchRequestChains(requestId as string),
    enabled: Boolean(requestId),
  });
}

export function useChain(chainId?: string) {
  return useQuery({
    queryKey: ['chains', chainId],
    queryFn: () => fetchChain(chainId as string),
    enabled: Boolean(chainId),
  });
}
