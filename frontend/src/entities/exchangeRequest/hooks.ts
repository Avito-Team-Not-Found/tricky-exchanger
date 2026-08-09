import { useQuery } from '@tanstack/react-query';

import { fetchRequest, fetchRequests } from './api';

export function useRequests() {
  return useQuery({ queryKey: ['exchange-requests'], queryFn: fetchRequests });
}

export function useRequest(requestId?: number) {
  return useQuery({
    queryKey: ['exchange-requests', requestId],
    queryFn: () => fetchRequest(requestId as number),
    enabled: Boolean(requestId),
  });
}
