import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { fetchItem, fetchItems, ITEMS_PAGE_SIZE } from './api';

export function useItems() {
  // Пул всех товаров владельца: его читают пикер товара в заявке и поиск миниатюры по id
  // (карточки заявок, варианты обмена) — им нужен весь набор, а не страница. «Мои товары»
  // пагинируются отдельным хуком useItemsPage, не схлопывать их обратно (SCRUM-52 §6.1).
  return useQuery({ queryKey: ['items'], queryFn: () => fetchItems() });
}

export function useItemsPage() {
  return useInfiniteQuery({
    queryKey: ['items-page'],
    queryFn: ({ pageParam }) => fetchItems(pageParam, ITEMS_PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      // пустая страница (товары удалены в другой вкладке между запросами) не должна
      // зацикливать подгрузку на растущем номере страницы
      if (lastPage.items.length === 0 || loaded >= lastPage.total) return undefined;
      return allPages.length + 1;
    },
  });
}

export function useItem(itemId?: number) {
  return useQuery({
    queryKey: ['items', itemId],
    queryFn: () => fetchItem(itemId as number),
    enabled: Boolean(itemId),
  });
}
