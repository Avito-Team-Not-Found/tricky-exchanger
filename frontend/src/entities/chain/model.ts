import type { StatusTone } from '@shared/ui';

export type ChainStatus =
  'CANDIDATE' | 'PROPOSED' | 'FROZEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BROKEN';

export type VoteValue = 'pending' | 'approved' | 'rejected';

export interface ChainParticipant {
  clusterId: number;
  requestId: number;
  position: number;
  isCurrentUser: boolean;
  offeredItemId: number;
  offeredItemTitle: string;
  offeredItemDescription: string;
  wantedDescription: string;
  // фото может отсутствовать вовсе (omitempty), а не только быть null — поле опционально (PROJECT.md §4.4)
  imageUrl?: string | null;
  // отклик приходит только у кандидатов позиции receivesFromPosition
  vote?: VoteValue;
}

export interface Chain {
  id: number;
  status: ChainStatus;
  score: number;
  length: number;
  version: number;
  currentRequestId: number;
  currentPosition: number;
  givesToPosition: number;
  receivesFromPosition: number;
  freezeDeadlineAt?: string | null;
  invalidReason?: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ChainParticipant[];
}

export interface ExchangeOption {
  clusterId: number;
  requestId: number;
  itemId: number;
  title: string;
  description: string;
  wantedDescription: string;
  imageUrl?: string | null;
  vote?: VoteValue;
}

// варианты обмена по заявке: один кандидатный пул на цепочку, получаемое разворачивается в receiveOptions
export interface ExchangeOptions {
  chainId: number;
  status: ChainStatus;
  score: number;
  length: number;
  currentRequestId: number;
  currentPosition: number;
  givesToPosition: number;
  receivesFromPosition: number;
  currentOffer: ExchangeOption;
  receiveOptions: ExchangeOption[];
}

export interface VotePayload {
  requestId: number;
  targetRequestId: number;
}

export interface ChainVoteResult {
  chainId: number;
  requestId: number;
  targetRequestId: number;
  vote: VoteValue;
  votedAt: string;
  chainStatus: ChainStatus;
}

// ответ POST /chains/{id}/confirm: статус цепочки после подтверждения участника (SOFT-LOCK §3.1.3)
export interface ConfirmResult {
  chainId: number;
  status: ChainStatus;
}

// ответ POST /chains/{id}/decline: цепочка либо распалась (BROKEN), либо откатилась к сбору
// откликов (CANDIDATE), либо живёт с вакансией под замену (PROPOSED) — SOFT-LOCK §3.2.
// replacementAvailable относится к предыдущему по кольцу участнику, а не к отказавшемуся
export interface DeclineResult {
  chainId: number;
  status: ChainStatus;
  replacementAvailable: boolean;
}

export interface ChainLink {
  position: number;
  candidates: ChainParticipant[];
}

// статус отклика не передаётся одним лишь цветом — подпись текстом обязательна; глиф добавляется
// там, где есть (у pending подпись «Ожидаем» несёт смысл сама)
export const VOTE_META: Record<VoteValue, { label: string; glyph: string; tone: StatusTone }> = {
  pending: { label: 'Ожидаем', glyph: '', tone: 'warning' },
  approved: { label: 'Отклик принят', glyph: '✓', tone: 'success' },
  rejected: { label: 'Отклик отклонён', glyph: '✕', tone: 'error' },
};

// единая формулировка плашки жёсткой блокировки на карточке 4.6 и экране 4.7 (SOFT-LOCK §5.5/§7)
export const HARD_LOCK_MESSAGE = '🔒 Товар жёстко заблокирован: изменить или удалить заявку нельзя';

// цепочка заморожена или уже в сделке: товары и заявки жёстко заблокированы (SOFT-LOCK §5.5)
export function isHardLocked(status: ChainStatus): boolean {
  return status === 'FROZEN' || status === 'IN_PROGRESS';
}

// собранная цепочка, которая занимает заявку: кольцо откликов замкнулось (PROPOSED) или сделка
// уже идёт (FROZEN/IN_PROGRESS) — остальные варианты этого запроса приглушены и недоступны
export function isAssembled(status: ChainStatus): boolean {
  return status === 'PROPOSED' || isHardLocked(status);
}

// Участник текущего пользователя: только он может откликаться за себя
export function myParticipant(chain: Chain): ChainParticipant | null {
  return chain.participants.find((p) => p.isCurrentUser) ?? null;
}

// participants — это пул кандидатов, а не участники: одна позиция кольца развёрнута во все
// заявки своего кластера. Единица UI — звено (position + кандидаты), а не запись participants.
export function chainLinks(chain: Chain): ChainLink[] {
  const byPosition = new Map<number, ChainParticipant[]>();
  for (const participant of chain.participants) {
    const candidates = byPosition.get(participant.position);
    if (candidates) candidates.push(participant);
    else byPosition.set(participant.position, [participant]);
  }
  return [...byPosition.entries()]
    .sort(([a], [b]) => a - b)
    .map(([position, candidates]) => ({ position, candidates }));
}

// Что пользователь получит взамен: пул заявок следующего звена по кольцу (PROJECT.md §4.4).
// Пока цепочка CANDIDATE, кандидатов несколько — UI сам решает, как их показать.
export function receivesItem(chain: Chain): ChainParticipant[] {
  return chain.participants.filter((p) => p.position === chain.receivesFromPosition);
}
