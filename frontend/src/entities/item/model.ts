import type { StatusTone } from '@shared/ui';

export type ItemCondition = 'NEW' | 'LIKE_NEW' | 'USED' | 'NEEDS_REPAIR';
export type ItemStatus = 'ACTIVE' | 'RESERVED' | 'EXCHANGED';

export interface Item {
  id: string;
  title: string;
  description: string;
  categoryId: string | null;
  condition: ItemCondition;
  color: string | null;
  material: string | null;
  attributes: Record<string, unknown> | null;
  image: string | null;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ItemPayload {
  title: string;
  description: string;
  condition: ItemCondition;
  color?: string | null;
  material?: string | null;
  categoryId?: string | null;
}

export const ITEM_CONDITIONS: readonly { value: ItemCondition; label: string }[] = [
  { value: 'NEW', label: 'Новый' },
  { value: 'LIKE_NEW', label: 'Как новый' },
  { value: 'USED', label: 'Б/у' },
  { value: 'NEEDS_REPAIR', label: 'Требует ремонта' },
];

export const ITEM_STATUS_META: Record<ItemStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Активен', tone: 'success' },
  RESERVED: { label: 'Забронирован', tone: 'warning' },
  EXCHANGED: { label: 'Обменян', tone: 'success' },
};
