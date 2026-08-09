import { apiClient } from '@shared/api';

import type { Item, ItemPayload, ItemsList } from './model';

// Бэкенд не умеет фильтровать по статусу — список приходит вместе с архивными
// (личный список владельца), поэтому архивные отсекаем на клиенте. Запрашиваем
// максимальную страницу, чтобы на «Моих товарах» и в пикере товара ничего не терялось.
export async function fetchItems(): Promise<ItemsList> {
  const { data } = await apiClient.get<ItemsList>('/items', { params: { pageSize: 100 } });
  return { items: data.items.filter((item) => item.status !== 'ARCHIVED'), total: data.total };
}

export async function fetchItem(itemId: number): Promise<Item> {
  const { data } = await apiClient.get<Item>(`/items/${itemId}`);
  return data;
}

// Бэкенд создаёт товар JSON'ом, а фото грузит отдельной ручкой. Если загрузка фото
// упала, товар уже создан — выбрасываем ItemImageUploadError с созданным товаром,
// чтобы форма могла показать ошибку и увести на редактирование, не теряя созданное.
export async function createItem(payload: ItemPayload, image: File | null): Promise<Item> {
  const { data: created } = await apiClient.post<Item>('/items', payload);
  if (!image) return created;

  try {
    return await uploadItemImage(created.id, image);
  } catch (error) {
    throw new ItemImageUploadError(created, error);
  }
}

export async function updateItem(
  itemId: number,
  payload: ItemPayload,
  image: File | undefined,
): Promise<Item> {
  const { data: updated } = await apiClient.patch<Item>(`/items/${itemId}`, payload);
  if (!image) return updated;
  try {
    return await uploadItemImage(itemId, image);
  } catch (error) {
    throw new ItemImageUploadError(updated, error);
  }
}

export async function archiveItem(itemId: number): Promise<void> {
  await apiClient.delete(`/items/${itemId}`);
}

export class ItemImageUploadError extends Error {
  readonly item: Item;

  constructor(item: Item, cause: unknown) {
    super('Товар сохранён, но фото не загрузилось', { cause });
    this.name = 'ItemImageUploadError';
    this.item = item;
  }
}

async function uploadItemImage(itemId: number, image: File): Promise<Item> {
  const form = new FormData();
  form.append('image', image);
  const { data } = await apiClient.post<Item>(`/items/${itemId}/image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
