import type { QueryClient } from '@tanstack/react-query';

// заявка меняет статус вместе с цепочкой, поэтому ключи инвалидируются одним блоком —
// иначе экраны разъедутся по свежести данных
export function invalidateChainQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['chains'] });
  queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
  queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
}
