import type { Item, ItemCondition } from '@entities/item';

import type { StatusTone } from '@shared/ui';

export type RequestStatus = 'ACTIVE' | 'IN_PROPOSAL' | 'LOCKED' | 'DONE' | 'REMOVED';

export interface WantedProfile {
  categoryId?: string | null;
  acceptableCondition?: ItemCondition[] | null;
}

export interface ExchangeRequest {
  id: string;
  offeredItemId: string;
  offeredItem: Item | null;
  wantedDescription: string;
  wantedProfile: WantedProfile | null;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRequestPayload {
  offeredItemId: string;
  wantedDescription: string;
  wantedProfile: WantedProfile | null;
}

export interface CreateRequestResult {
  request: ExchangeRequest;
  matching: { createdCandidateChains: number };
}

export interface RequestDraft {
  offeredItemId: string;
  wantedDescription: string;
  wantedProfile: WantedProfile | null;
}

export interface RequestPatch {
  wantedDescription: string;
  wantedProfile: WantedProfile | null;
}

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Активен', tone: 'success' },
  IN_PROPOSAL: { label: 'В процессе', tone: 'warning' },
  LOCKED: { label: 'Заблокирован', tone: 'neutral' },
  DONE: { label: 'Завершён', tone: 'neutral' },
  REMOVED: { label: 'Отменён', tone: 'error' },
};

// живые состояния заявки — в поиске или с предложенными цепочками; LOCKED/DONE/REMOVED не редактируются
export function isRequestEditable(status: RequestStatus): boolean {
  return status === 'ACTIVE' || status === 'IN_PROPOSAL';
}
