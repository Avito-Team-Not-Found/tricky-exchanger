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

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Активен', tone: 'success' },
  UNAVAILABLE: { label: 'Зарезервирован', tone: 'warning' },
  ARCHIVED: { label: 'В архиве', tone: 'neutral' },
};
