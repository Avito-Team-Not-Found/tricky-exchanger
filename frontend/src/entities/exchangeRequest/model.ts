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

// Обёртка, которую раньше отдавал мок; реальный бэкенд возвращает только объект
// заявки, а матчинг пока заглушка — createdCandidateChains всегда 0 (SCRUM-50 §5).
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
  LOCKED: { label: 'Заблокирован', tone: 'neutral' },
  DONE: { label: 'Завершён', tone: 'neutral' },
  IN_PROGRESS: { label: 'Выполняется', tone: 'neutral' },
};

// живые состояния заявки — в поиске или с предложенными цепочками; остальные не редактируются.
// REMOVED на бэкенде отфильтровывается из списка/детали, поэтому в UI его нет.
export function isRequestEditable(status: RequestStatus): boolean {
  return status === 'ACTIVE' || status === 'IN_PROPOSAL';
}
