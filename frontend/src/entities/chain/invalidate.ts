import type { QueryClient } from '@tanstack/react-query';

// Любая мутация над цепочкой меняет статусы цепочек, варианты обмена и статусы заявок
// (заявка переходит в IN_PROPOSAL/LOCKED вместе со статусом цепочки) — ключи инвалидируются
// одним блоком, чтобы экраны не разъехались по свежести данных
export function invalidateChainQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['chains'] });
  queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
  queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
}
