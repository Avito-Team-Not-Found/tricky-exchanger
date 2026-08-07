import { apiClient } from '@shared/api';

import type { Category } from './model';

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await apiClient.get<Category[]>('/categories');
  return data;
}
