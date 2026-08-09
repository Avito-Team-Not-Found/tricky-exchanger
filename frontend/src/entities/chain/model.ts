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

// Кандидат на замену выбывшего участника: заявка из того же псевдокластера, уже отфильтрованная
// и отсортированная сервером (TZ §3.1). Список не собирается на клиенте ни из каких других источников.
export interface ReplacementOption {
  requestId: number;
  offeredItemId: number;
  title: string;
  description: string;
  wantedDescription: string;
  // фото может отсутствовать вовсе (omitempty) — поле опционально, а не только null
  imageUrl?: string | null;
  reliability: number;
  respondedAt: string;
}

export interface SelectReplacementResult {
  chainId: number;
  requestId: number;
  status: ChainStatus;
}

export interface DeclineResult {
  chainId: number;
  status: ChainStatus;
  replacementAvailable: boolean;
}

export interface ChainLink {
  position: number;
  candidates: ChainParticipant[];
}

// глиф перед подписью — требование доступности: статус отклика не передаётся одним лишь цветом
export const VOTE_META: Record<VoteValue, { label: string; glyph: string; tone: StatusTone }> = {
  pending: { label: 'Отклик отправлен', glyph: '⏳', tone: 'warning' },
  approved: { label: 'Отклик принят', glyph: '✓', tone: 'success' },
  rejected: { label: 'Отклик отклонён', glyph: '✕', tone: 'error' },
};

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

// Лучшая цепочка среди вариантов одной заявки — с максимальной вероятностью успеха (score).
// При равенстве score выигрывает меньший chainId: иначе отметка прыгала бы между равными
// цепочками при каждом рефетче. Единственный вариант тоже лучший: на практике у заявки чаще
// всего ровно одна цепочка, и без отметки плашка не появлялась бы почти нигде.
export function bestChainId(options: ExchangeOptions[]): number | null {
  if (options.length === 0) return null;
  return options.reduce((best, option) =>
    option.score > best.score || (option.score === best.score && option.chainId < best.chainId)
      ? option
      : best,
  ).chainId;
}

// Что пользователь получит взамен: пул заявок следующего звена по кольцу (PROJECT.md §4.4).
// Пока цепочка CANDIDATE, кандидатов несколько — UI сам решает, как их показать.
export function receivesItem(chain: Chain): ChainParticipant[] {
  return chain.participants.filter((p) => p.position === chain.receivesFromPosition);
}
