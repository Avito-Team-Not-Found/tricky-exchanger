import type { RequestStatus } from '@entities/exchangeRequest';

import type { StatusTone } from '@shared/ui';

export type ChainStatus =
  'CANDIDATE' | 'PROPOSED' | 'FROZEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BROKEN';

// 'thinking' клиент не выставляет — сервер возвращает такой голос по старым данным
export type VoteValue = 'pending' | 'approved' | 'rejected' | 'thinking';

// participants — пул кандидатов, а не участники: на CANDIDATE каждая позиция кольца развёрнута
// во все заявки своего кластера. vote привязан к цели: решение позиции p лежит в vote следующей.
// freezeDeadlineAt на PROPOSED — дедлайн ответа (или подбора быстрой замены при
// invalidReason = 'frozen_replacement'), на FROZEN — дедлайн отправки
export interface ChainParticipant {
  clusterId: number;
  requestId: number;
  position: number;
  isCurrentUser: boolean;
  offeredItemId: number;
  offeredItemTitle: string;
  offeredItemDescription: string;
  wantedDescription: string;
  // фото может отсутствовать вовсе (omitempty), а не только быть null
  imageUrl?: string | null;
  // LOCKED — не отправлен, IN_PROGRESS — отправлен, DONE — получатель подтвердил
  requestStatus: RequestStatus;
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

// пул уже отфильтрован и отсортирован сервером — на клиенте список ниоткуда не дособирается
export interface ReplacementOption {
  requestId: number;
  offeredItemId: number;
  title: string;
  description: string;
  wantedDescription: string;
  // фото может отсутствовать вовсе (omitempty), а не только быть null
  imageUrl?: string | null;
  reliability: number;
  respondedAt: string;
}

export interface SelectReplacementResult {
  chainId: number;
  requestId: number;
  status: ChainStatus;
}

export interface ConfirmResult {
  chainId: number;
  status: ChainStatus;
}

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

export interface FulfillmentResult {
  chainId: number;
  requestId: number;
  status: ChainStatus;
}

// thinking — значение второго раунда, в словаре первого ему места нет
export const VOTE_META: Partial<Record<VoteValue, ConfirmVoteMeta>> = {
  pending: { label: 'Ожидаем', tone: 'warning' },
  approved: { label: 'Отклик принят', tone: 'success' },
  rejected: { label: 'Отклик отклонён', tone: 'error' },
};

export interface ConfirmVoteMeta {
  label: string;
  tone: StatusTone;
}

export const CONFIRM_VOTE_META: Record<VoteValue, ConfirmVoteMeta> = {
  approved: { label: 'Согласился', tone: 'success' },
  thinking: { label: 'Думает', tone: 'warning' },
  pending: { label: 'Ожидает ответа', tone: 'warning' },
  rejected: { label: 'Отказался', tone: 'error' },
};

// пустой голос у участника позиции (p + 1) % length означает вакансию на позиции p
export const VACANCY_META: ConfirmVoteMeta = {
  label: 'Место освободилось',
  tone: 'neutral',
};

export const HARD_LOCK_MESSAGE = 'Товар жёстко заблокирован: изменить или удалить заявку нельзя';

export function isHardLocked(status: ChainStatus): boolean {
  return status === 'FROZEN' || status === 'IN_PROGRESS';
}

// на COMPLETED жёсткой блокировки уже нет, но сделку открыть всё равно нужно
export function hasDeal(status: ChainStatus): boolean {
  return isHardLocked(status) || status === 'COMPLETED';
}

// до первого handoff цепочка не покидает FROZEN
export function needsShipment(status: ChainStatus): boolean {
  return status === 'FROZEN';
}

// уже с PROPOSED цепочка занимает заявку — остальные варианты запроса приглушаются
export function isAssembled(status: ChainStatus): boolean {
  return status === 'PROPOSED' || isHardLocked(status);
}

// вероятность показываем, пока она ещё влияет на решение: на CANDIDATE (выбор варианта), PROPOSED
// (подтверждение) и FROZEN (товар не отправлен); дальше сделка исполнена или распалась — бейдж пуст
export function showsScore(status: ChainStatus): boolean {
  return status === 'CANDIDATE' || status === 'PROPOSED' || status === 'FROZEN';
}

// быстрая замена после отказа на FROZEN: цепочка снова PROPOSED, но дедлайн у неё — подбор
// замены, а не ответа (см. PROJECT.md §4.8)
export function isFrozenReplacement(chain: Chain): boolean {
  return chain.status === 'PROPOSED' && chain.invalidReason === 'frozen_replacement';
}

export function myParticipant(chain: Chain): ChainParticipant | null {
  return chain.participants.find((p) => p.isCurrentUser) ?? null;
}

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

// заявки кластера принадлежат разным пользователям: без сужения по requestId экран показал бы
// их чужие товары под одним участником, а неизвестный requestId возвращает весь пул, не пустоту
export function receivesItem(chain: Chain, requestId?: number): ChainParticipant[] {
  const sources = chain.participants.filter((p) => p.position === chain.receivesFromPosition);
  if (requestId === undefined) return sources;
  const selected = sources.find((p) => p.requestId === requestId);
  return selected ? [selected] : sources;
}

// на собранной цепочке на позицию приходится ровно один участник
export function sourceParticipant(chain: Chain): ChainParticipant | null {
  const sources = receivesItem(chain);
  return sources.length === 1 ? sources[0] : null;
}

// на CANDIDATE позиций может быть меньше length — считать по формуле (p + 1) % length нельзя
export function nextInRing(chain: Chain, position: number): number | null {
  const positions = [...new Set(chain.participants.map((p) => p.position))].sort((a, b) => a - b);
  const index = positions.indexOf(position);
  if (positions.length === 0 || index === -1) return null;
  return positions[(index + 1) % positions.length];
}

// пустой vote на следующей позиции — вакансия, а не pending
export function confirmVoteAt(chain: Chain, position: number): VoteValue | null {
  const next = nextInRing(chain, position);
  if (next === null) return null;
  return chain.participants.find((p) => p.position === next)?.vote ?? null;
}

// на карточке вариантов то же значение приезжает как receiveOptions[0].vote
export function myConfirmVote(chain: Chain): VoteValue | null {
  return confirmVoteAt(chain, chain.currentPosition);
}

// соответствие «голосующий ↔ цель» биективно, поэтому сдвиг голосов на счёт не влияет
export function approvedVotes(chain: Chain): number {
  if (!isAssembled(chain.status)) return 0;
  return chain.participants.reduce((count, p) => count + (p.vote === 'approved' ? 1 : 0), 0);
}

export function needsMyAction(chain: Chain): boolean {
  return chain.status === 'PROPOSED' && myConfirmVote(chain) !== 'approved';
}

export type DealState =
  | { status: 'ship'; deadlineAt: string | null }
  | { status: 'shipped-waiting'; shipped: number; total: number }
  | { status: 'in-transit'; shipped: number; total: number }
  | { status: 'received-waiting' }
  | { status: 'completed' }
  | { status: 'unavailable' };

export function dealState(chain: Chain): DealState {
  if (chain.status === 'COMPLETED') return { status: 'completed' };
  if (chain.status !== 'FROZEN' && chain.status !== 'IN_PROGRESS') {
    return { status: 'unavailable' };
  }
  const me = myParticipant(chain);
  if (!me) return { status: 'unavailable' };
  const total = chain.length;
  const shipped = chain.participants.filter((p) => p.requestStatus !== 'LOCKED').length;
  // экран отправки виден и на IN_PROGRESS: первым мог отправиться сосед
  if (me.requestStatus === 'LOCKED') {
    return { status: 'ship', deadlineAt: chain.freezeDeadlineAt ?? null };
  }
  if (sourceParticipant(chain)?.requestStatus === 'DONE') return { status: 'received-waiting' };
  if (shipped < total) return { status: 'shipped-waiting', shipped, total };
  return { status: 'in-transit', shipped, total };
}
