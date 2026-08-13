import type { StatusTone } from '@shared/ui';

export type RequestStatus = 'ACTIVE' | 'IN_PROPOSAL' | 'LOCKED' | 'DONE' | 'IN_PROGRESS';

// Бэкенд вкладывает название отдаваемого товара только в список заявок
// (GET /exchange-offers); в детали (GET /exchange-offers/:id) его нет.
export interface ExchangeRequest {
  id: number;
  offeredItemId: number;
  offeredItemTitle?: string;
  wantedDescription: string;
  // категория желаемого товара; в подборе не участвует (бэкенд строит эмбеддинг
  // только по wantedDescription) — поле витринное
  wantedCategory: string;
  status: RequestStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRequestPayload {
  offeredItemId: number;
  wantedDescription: string;
  wantedCategory?: string;
}

// число найденных цепочек бэкенд в ответе создания не отдаёт — фронт берёт его из exchange-options
export interface CreateRequestResult {
  request: ExchangeRequest;
  matching: { createdCandidateChains: number };
}

export interface UpdateRequestPayload {
  offeredItemId: number;
  wantedDescription: string;
  wantedCategory?: string;
  version: number;
}

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Активен', tone: 'success' },
  IN_PROPOSAL: { label: 'В процессе', tone: 'warning' },
  LOCKED: { label: 'Зарезервирован', tone: 'neutral' },
  DONE: { label: 'Завершён', tone: 'neutral' },
  IN_PROGRESS: { label: 'Выполняется', tone: 'neutral' },
};

// REMOVED бэкенд отфильтровывает из списка и детали, поэтому в UI такого статуса нет
export function isRequestEditable(status: RequestStatus): boolean {
  return status === 'ACTIVE' || status === 'IN_PROPOSAL';
}
