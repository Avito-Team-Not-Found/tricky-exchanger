import type { StatusTone } from '@shared/ui';

export type ItemStatus = 'ACTIVE' | 'UNAVAILABLE' | 'ARCHIVED';

export interface Item {
  id: number;
  title: string;
  description: string;
  categoryId: number | null;
  imageUrl: string | null;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ItemPayload {
  title: string;
  description: string;
  categoryId?: number | null;
}

// страница списка товаров: total отдаёт сервер, чтобы клиент видел обрезание по pageSize
export interface ItemsList {
  items: Item[];
  total: number;
}

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Активен', tone: 'success' },
  UNAVAILABLE: { label: 'Недоступен', tone: 'warning' },
  ARCHIVED: { label: 'В архиве', tone: 'neutral' },
};
