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

// список повторяет то, что принимает бэкенд
export const ITEM_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

// максимальный размер фото товара — совпадает с лимитом бэкенда (5 МиБ)
export const ITEM_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

// accept фильтрует только диалог выбора: файл можно притащить drag-and-drop'ом, и тогда 422
// прилетит уже после успешного сохранения товара
export function getItemImageError(file: { type: string; size: number }): string | null {
  if (!ITEM_IMAGE_TYPES.includes(file.type as (typeof ITEM_IMAGE_TYPES)[number])) {
    return 'Фото должно быть в формате JPG, PNG или WEBP';
  }
  if (file.size > ITEM_IMAGE_MAX_SIZE_BYTES) {
    return 'Фото не больше 5 МБ';
  }
  return null;
}

// ARCHIVED — это завершённый обмен, а не «архив»: удаление товара архива не создаёт
export const ITEM_STATUS_META: Record<ItemStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Активен', tone: 'success' },
  UNAVAILABLE: { label: 'Зарезервирован', tone: 'warning' },
  ARCHIVED: { label: 'Обменян', tone: 'neutral' },
};

// обменянный товар остаётся в списке как история, но он уже отдан: ни редактировать,
// ни предлагать в новой заявке его нельзя (бэкенд отклоняет мутации архивных)
export function isItemExchanged(status: ItemStatus): boolean {
  return status === 'ARCHIVED';
}
