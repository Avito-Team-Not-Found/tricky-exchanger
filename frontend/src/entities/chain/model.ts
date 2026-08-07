import type { StatusTone } from '@shared/ui';

export type ChainStatus = 'CANDIDATE' | 'PROPOSED' | 'FROZEN' | 'IN_PROGRESS';
export type ResponseStatus = 'ACCEPTED' | 'DECLINED';
export type FreezeVoteStatus = 'CONFIRMED' | 'DECLINED';

export interface ChainItemRef {
  id: string;
  title: string;
  image: string | null;
  // описание/характеристики товара для экрана цепочки (макет 4.7); мок кладёт их в offeredItem
  description?: string | null;
  categoryId?: string | null;
  color?: string | null;
  material?: string | null;
  attributes?: Record<string, string> | null;
}

export interface ChainUserRef {
  id: string;
  name: string;
}

export interface ChainParticipant {
  position: number;
  requestId: string | null;
  isCurrentUser: boolean;
  user: ChainUserRef;
  offeredItem: ChainItemRef | null;
  receivesFromPosition: number;
  responseStatus: ResponseStatus | null;
  freezeVoteStatus: FreezeVoteStatus | null;
}

export interface ChainPermissions {
  canRespond: boolean;
  // выбор не эксклюзивен: пользователь отмечает сколько угодно вариантов и снимает отметку (макет 4.6)
  canSelect: boolean;
  canDeselect: boolean;
  canVote: boolean;
  canRequestReplacement: boolean;
}

export interface Chain {
  id: string;
  requestId: string;
  status: ChainStatus;
  score: number;
  responseDeadlineAt: string | null;
  freezeDeadlineAt: string | null;
  participants: ChainParticipant[];
  viewerPermissions: ChainPermissions;
}

export interface ChainResponseResult {
  chainId: string;
  status: ChainStatus;
  isReadyForSelection: boolean;
}

// глиф перед подписью — требование доступности: статус отклика не передаётся одним лишь цветом
export const RESPONSE_STATUS_META: Record<
  ResponseStatus,
  { label: string; glyph: string; tone: StatusTone }
> = {
  ACCEPTED: { label: 'Согласился', glyph: '✓', tone: 'success' },
  DECLINED: { label: 'Отказался', glyph: '✕', tone: 'error' },
};

// Участник текущего пользователя: только он может отвечать за себя (viewerPermissions не дублируем)
export function myParticipant(chain: Chain): ChainParticipant | null {
  return chain.participants.find((p) => p.isCurrentUser) ?? null;
}

// Прогресс готовности цепочки: сколько участников уже согласились (макет «N/M согласий»)
export function chainReadiness(chain: Chain): { agreed: number; total: number } {
  const total = chain.participants.length;
  const agreed = chain.participants.filter((p) => p.responseStatus === 'ACCEPTED').length;
  return { agreed, total };
}

// Что участник получает взамен: товар следующего звена по кольцу (PROJECT.md §4.4)
export function receivesItem(participant: ChainParticipant, chain: Chain): ChainItemRef | null {
  return (
    chain.participants.find((p) => p.position === participant.receivesFromPosition)?.offeredItem ??
    null
  );
}
