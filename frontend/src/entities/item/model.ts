import type { StatusTone } from '@shared/ui';

export type ItemStatus = 'ACTIVE' | 'UNAVAILABLE' | 'ARCHIVED';

export interface Item {
  id: number;
  title: string;
  description: string;
  // текстовое имя категории из справочника @shared/config/categories; у товаров,
  // созданных до миграции на текстовую категорию, приходит пустая строка
  category: string;
  imageUrl: string | null;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ItemPayload {
  title: string;
  description: string;
  category?: string;
}

// страница списка товаров: total отдаёт сервер, чтобы клиент видел обрезание по pageSize
export interface ItemsList {
  items: Item[];
  total: number;
}

// типы фото, которые принимает бэкенд (service/item/service.go) — список для accept-атрибута
// и клиентской проверки, чтобы неверный файл не уходил на сервер уже после сохранения товара
export const ITEM_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// максимальный размер фото товара — совпадает с лимитом бэкенда (5 МиБ)
export const ITEM_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

// Проверка фото на месте выбора: accept фильтрует диалог выбора, но файл можно притащить
// drag-and-drop'ом или выбрать через «Все файлы» — неверный файл не должен уходить на сервер
// и откатываться 422 уже после успешного сохранения товара.
export function getItemImageError(file: { type: string; size: number }): string | null {
  if (!ITEM_IMAGE_TYPES.includes(file.type as (typeof ITEM_IMAGE_TYPES)[number])) {
    return 'Фото должно быть в формате JPG, PNG или WEBP';
  }
  if (file.size > ITEM_IMAGE_MAX_SIZE_BYTES) {
    return 'Фото не больше 5 МБ';
  }
  return null;
}

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Активен', tone: 'success' },
  UNAVAILABLE: { label: 'Зарезервирован', tone: 'warning' },
  ARCHIVED: { label: 'В архиве', tone: 'neutral' },
};
