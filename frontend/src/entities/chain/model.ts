import type { RequestStatus } from '@entities/exchangeRequest';

import type { StatusTone } from '@shared/ui';

export type ChainStatus =
  'CANDIDATE' | 'PROPOSED' | 'FROZEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BROKEN';

// 'thinking' — отложенное решение второго раунда: клиент его не выставляет, но сервер такой
// голос всё ещё возвращает по старым данным — читаем только на отображение
export type VoteValue = 'pending' | 'approved' | 'rejected' | 'thinking';

// Доменные инварианты модели:
// - participants — это пул кандидатов, а не участники: пока цепочка CANDIDATE, каждая позиция
//   кольца развёрнута во все заявки своего кластера (participants.length на порядок больше length).
// - vote привязан к цели голосования, а не к голосующему: решение участника позиции p лежит
//   в vote участника следующей по кольцу позиции.
// - freezeDeadlineAt несёт разный смысл: на PROPOSED — дедлайн ответа, на FROZEN — дедлайн отправки.
export interface ChainParticipant {
  clusterId: number;
  requestId: number;
  position: number;
  isCurrentUser: boolean;
  offeredItemId: number;
  offeredItemTitle: string;
  offeredItemDescription: string;
  wantedDescription: string;
  // фото может отсутствовать вовсе (omitempty), а не только быть null — поле опционально
  imageUrl?: string | null;
  // статус заявки участника — единственный источник состояния экрана сделки:
  // LOCKED — не отправлен, IN_PROGRESS — отправлен, DONE — получатель подтвердил
  requestStatus: RequestStatus;
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

// один кандидатный пул на цепочку, получаемое разворачивается в receiveOptions
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

export interface ConfirmResult {
  chainId: number;
  status: ChainStatus;
}

// цепочка либо распалась (BROKEN), либо откатилась к сбору откликов (CANDIDATE), либо живёт
// с вакансией под замену (PROPOSED); replacementAvailable относится к предыдущему по кольцу
// участнику, а не к отказавшемуся
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

// первый раунд: thinking — значение второго раунда, в словаре ему места нет (Partial не требует ветки)
export const VOTE_META: Partial<Record<VoteValue, ConfirmVoteMeta>> = {
  pending: { label: 'Ожидаем', tone: 'warning' },
  approved: { label: 'Отклик принят', tone: 'success' },
  rejected: { label: 'Отклик отклонён', tone: 'error' },
};

// то же поле vote во втором раунде несёт другой смысл — применяется по статусу цепочки, а не по наличию поля
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

// единая формулировка плашки жёсткой блокировки — чтобы текст был одинаковым везде
export const HARD_LOCK_MESSAGE = 'Товар жёстко заблокирован: изменить или удалить заявку нельзя';

// цепочка заморожена или уже в сделке: товары и заявки жёстко заблокированы
export function isHardLocked(status: ChainStatus): boolean {
  return status === 'FROZEN' || status === 'IN_PROGRESS';
}

// isHardLocked намеренно не включает COMPLETED — жёсткой блокировки там уже нет,
// но сделку открыть всё равно нужно
export function hasDeal(status: ChainStatus): boolean {
  return isHardLocked(status) || status === 'COMPLETED';
}

// до первого handoff цепочка не покидает FROZEN — FROZEN строго означает «сделка началась, я ещё не отправил»
export function needsShipment(status: ChainStatus): boolean {
  return status === 'FROZEN';
}

// собранная цепочка, которая занимает заявку: остальные варианты этого запроса приглушены
export function isAssembled(status: ChainStatus): boolean {
  return status === 'PROPOSED' || isHardLocked(status);
}

// только участник-владелец может откликаться за себя
export function myParticipant(chain: Chain): ChainParticipant | null {
  return chain.participants.find((p) => p.isCurrentUser) ?? null;
}

// единица UI — звено (position + кандидаты), а не запись participants
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

// пул заявок следующего звена по кольцу; пока цепочка CANDIDATE, кандидатов несколько — UI сам решает, как их показать
export function receivesItem(chain: Chain): ChainParticipant[] {
  return chain.participants.filter((p) => p.position === chain.receivesFromPosition);
}

// единственный участник на позиции источника: на собранной цепочке на позицию приходится ровно один
export function sourceParticipant(chain: Chain): ChainParticipant | null {
  const sources = receivesItem(chain);
  return sources.length === 1 ? sources[0] : null;
}

// следующая по кольцу позиция ищется по фактическому набору позиций, а не по формуле:
// на CANDIDATE позиций может быть меньше length, а индексация с нуля на смысл не влияет
export function nextInRing(chain: Chain, position: number): number | null {
  const positions = [...new Set(chain.participants.map((p) => p.position))].sort((a, b) => a - b);
  const index = positions.indexOf(position);
  if (positions.length === 0 || index === -1) return null;
  return positions[(index + 1) % positions.length];
}

// решение участника позиции p приходит со следующего по кольцу звена (голос — ребро «я → тот,
// у кого получаю»); пустой vote на следующей позиции — вакансия, а не pending
export function confirmVoteAt(chain: Chain, position: number): VoteValue | null {
  const next = nextInRing(chain, position);
  if (next === null) return null;
  return chain.participants.find((p) => p.position === next)?.vote ?? null;
}

// мой голос второго раунда = решение участника на позиции, от которой я получаю;
// на карточке вариантов то же значение приезжает как receiveOptions[0].vote
export function myConfirmVote(chain: Chain): VoteValue | null {
  return confirmVoteAt(chain, chain.currentPosition);
}

// счётчик согласий: соответствие «голосующий ↔ цель» биективно, поэтому сдвиг на счёт не влияет
export function approvedVotes(chain: Chain): number {
  if (!isAssembled(chain.status)) return 0;
  return chain.participants.reduce((count, p) => count + (p.vote === 'approved' ? 1 : 0), 0);
}

// пока мой голос не approved (ни pending, ни thinking) — кнопка «Требуются действия» остаётся
export function needsMyAction(chain: Chain): boolean {
  return chain.status === 'PROPOSED' && myConfirmVote(chain) !== 'approved';
}

// дискриминант экрана сделки: «Отправил» = заявка участника уже не LOCKED, «я забрал» =
// у звена-источника заявка DONE. CANDIDATE/PROPOSED/BROKEN — сделки ещё нет, ссылки на /deal нет
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
  // я ещё не отправил — экран отправки виден и на IN_PROGRESS: первым мог отправиться сосед
  if (me.requestStatus === 'LOCKED') {
    return { status: 'ship', deadlineAt: chain.freezeDeadlineAt ?? null };
  }
  if (sourceParticipant(chain)?.requestStatus === 'DONE') return { status: 'received-waiting' };
  if (shipped < total) return { status: 'shipped-waiting', shipped, total };
  return { status: 'in-transit', shipped, total };
}
