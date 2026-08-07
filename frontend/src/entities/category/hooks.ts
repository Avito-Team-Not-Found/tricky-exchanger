import { useQuery } from '@tanstack/react-query';

import { fetchCategories } from './api';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
}
