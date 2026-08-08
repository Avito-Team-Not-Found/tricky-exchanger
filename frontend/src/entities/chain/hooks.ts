import { useQuery } from '@tanstack/react-query';

import { featureChainsEnabled } from '@shared/config/env';

import { fetchChain, fetchRequestChains } from './api';

export function useRequestChains(requestId?: string) {
  return useQuery({
    queryKey: ['chains', 'request', requestId],
    queryFn: () => fetchRequestChains(requestId as string),
    // раздел цепочек выключен флагом до появления Chains API на бэкенде (SCRUM-50 §7)
    enabled: Boolean(requestId) && featureChainsEnabled,
  });
}

export function useChain(chainId?: string) {
  return useQuery({
    queryKey: ['chains', chainId],
    queryFn: () => fetchChain(chainId as string),
    enabled: Boolean(chainId) && featureChainsEnabled,
  });
}
