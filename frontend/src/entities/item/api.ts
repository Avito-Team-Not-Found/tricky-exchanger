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

// image === undefined — фото не трогаем, File — заменить. Удаление фото недоступно:
// фото обязательно в обеих формах (см. useItemForm.hasPhoto), поэтому нечем и незачем его чистить.
export async function updateItem(
  itemId: string,
  payload: ItemPayload,
  image: File | undefined,
): Promise<Item> {
  if (image === undefined) {
    const { data } = await apiClient.patch<Item>(`/items/${itemId}`, payload);
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
  // multipart не умеет null, поэтому очистка поля едет пустой строкой (сервер трактует её как null),
  // а «не трогать поле» — отсутствием ключа. Раньше здесь была проверка на truthy, из-за которой
  // очистка цвета/материала терялась, если пользователь заодно менял фото.
  appendOptional(form, 'color', payload.color);
  appendOptional(form, 'material', payload.material);
  appendOptional(form, 'categoryId', payload.categoryId);
  if (image) form.append('image', image);
  return form;
}

function appendOptional(form: FormData, key: string, value: string | null | undefined): void {
  if (value === undefined) return;
  form.append(key, value ?? '');
}
