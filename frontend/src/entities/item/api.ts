import { apiClient } from '@shared/api';

import type { Item, ItemPayload } from './model';

export async function fetchItems(): Promise<Item[]> {
  const { data } = await apiClient.get<Item[]>('/items');
  return data;
}

export async function fetchItem(itemId: string): Promise<Item> {
  const { data } = await apiClient.get<Item>(`/items/${itemId}`);
  return data;
}

export async function createItem(payload: ItemPayload, image: File | null): Promise<Item> {
  const { data } = await apiClient.post<Item>('/items', toItemFormData(payload, image), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// image === undefined — фото не трогаем, image === null — удалить, File — заменить
export async function updateItem(
  itemId: string,
  payload: ItemPayload,
  image: File | null | undefined,
): Promise<Item> {
  if (image === undefined) {
    const { data } = await apiClient.patch<Item>(`/items/${itemId}`, payload);
    return data;
  }
  if (image === null) {
    const { data } = await apiClient.patch<Item>(`/items/${itemId}`, { ...payload, image: null });
    return data;
  }
  const { data } = await apiClient.patch<Item>(`/items/${itemId}`, toItemFormData(payload, image), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function archiveItem(itemId: string): Promise<void> {
  await apiClient.delete(`/items/${itemId}`);
}

function toItemFormData(payload: ItemPayload, image: File | null): FormData {
  const form = new FormData();
  form.append('title', payload.title);
  form.append('description', payload.description);
  form.append('condition', payload.condition);
  if (payload.color) form.append('color', payload.color);
  if (payload.material) form.append('material', payload.material);
  if (payload.categoryId) form.append('categoryId', payload.categoryId);
  if (image) form.append('image', image);
  return form;
}
