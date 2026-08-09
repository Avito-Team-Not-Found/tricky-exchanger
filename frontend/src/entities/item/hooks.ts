import { useQuery } from '@tanstack/react-query';

import { fetchItem, fetchItems } from './api';

export function useItems() {
  return useQuery({ queryKey: ['items'], queryFn: fetchItems });
}

export function useItem(itemId?: number) {
  return useQuery({
    queryKey: ['items', itemId],
    queryFn: () => fetchItem(itemId as number),
    enabled: Boolean(itemId),
  });
}
