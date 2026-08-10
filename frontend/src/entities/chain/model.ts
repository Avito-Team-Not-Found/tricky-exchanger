import type { RequestStatus } from '@entities/exchangeRequest';

import type { StatusTone } from '@shared/ui';

export type ChainStatus =
  'CANDIDATE' | 'PROPOSED' | 'FROZEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BROKEN';

// 'thinking' — явное «я подумаю» второго раунда (SOFT-LOCK §3.2), четвёртое значение VoteValue
export type VoteValue = 'pending' | 'approved' | 'rejected' | 'thinking';

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
  // статус заявки участника — единственный источник состояния экрана сделки (DEAL-PLAN.md §2.2):
  // LOCKED — товар не отправлен, IN_PROGRESS — отправлен (в ПВЗ), DONE — получатель подтвердил получение
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

// ответ POST /integrations/avito/handoffs и POST /chains/{id}/receipt: статус цепочки после
// подтверждения отправки/получения (DEAL-PLAN.md §2.2)
export interface FulfillmentResult {
  chainId: number;
  requestId: number;
  status: ChainStatus;
}

// статус отклика не передаётся одним лишь цветом — подпись текстом обязательна. Только первый
// раунд: thinking — значение второго раунда, в словаре ему места нет (Partial не требует ветки)
export const VOTE_META: Partial<Record<VoteValue, ConfirmVoteMeta>> = {
  pending: { label: 'Ожидаем', tone: 'warning' },
  approved: { label: 'Отклик принят', tone: 'success' },
  rejected: { label: 'Отклик отклонён', tone: 'error' },
};

// Голос второго раунда (SOFT-LOCK §8): решение участника по собранной цепочке. В отличие от
// VOTE_META применяется по статусу цепочки, а не по наличию поля — одно поле vote несёт два смысла
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

// пустой голос у участника позиции (p + 1) % length означает вакансию на позиции p (SOFT-LOCK §3.3)
export const VACANCY_META: ConfirmVoteMeta = {
  label: 'Место освободилось',
  tone: 'neutral',
};

// единая формулировка плашки жёсткой блокировки на карточке 4.6 и экране 4.7 (SOFT-LOCK §5.5/§7)
export const HARD_LOCK_MESSAGE = 'Товар жёстко заблокирован: изменить или удалить заявку нельзя';

// цепочка заморожена или уже в сделке: товары и заявки жёстко заблокированы (SOFT-LOCK §5.5)
export function isHardLocked(status: ChainStatus): boolean {
  return status === 'FROZEN' || status === 'IN_PROGRESS';
}

// кнопка «Перейти к сделке» и экран /deal доступны и на завершённой цепочке: isHardLocked
// намеренно не включает COMPLETED (жёсткой блокировки там уже нет), но сделку открыть всё равно нужно
export function hasDeal(status: ChainStatus): boolean {
  return isHardLocked(status) || status === 'COMPLETED';
}

// Нужно ли отправить свой товар: до первого handoff цепочка не покидает FROZEN (service.Handoff
// переводит её в IN_PROGRESS), поэтому FROZEN строго означает «сделка началась, я ещё не отправил».
// На 4.6/4.7 вместо «Перейти к сделке» показываем «Требуется действие».
export function needsShipment(status: ChainStatus): boolean {
  return status === 'FROZEN';
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

// Единственное звено, от которого текущий пользователь получает товар: на собранной цепочке
// (FROZEN и дальше) на позицию приходится ровно один участник — источник для «Я забрал товар»
export function sourceParticipant(chain: Chain): ChainParticipant | null {
  const sources = receivesItem(chain);
  return sources.length === 1 ? sources[0] : null;
}

// Решение второго раунда участника позиции p лежит в vote участника следующей по кольцу позиции:
// строка votes — ребро «я → тот, у кого получаю», которое раскладывается по цели голосования,
// а не по голосующему (SOFT-LOCK §3.3). Следующая позиция ищется по фактическому набору позиций
// кольца, а не по формуле с базой отсчёта: бэкенд отдаёт позиции с нуля, а псевдонимы фронта
// ожидают с единицы — модуль по реальному набору верен для обеих раскладок. Пустой vote на
// следующей позиции — участник p отказался, его голос удалён: это вакансия, а не pending.
export function confirmVoteAt(chain: Chain, position: number): VoteValue | null {
  const positions = [...new Set(chain.participants.map((p) => p.position))].sort((a, b) => a - b);
  const index = positions.indexOf(position);
  if (positions.length === 0 || index === -1) return null;
  const nextPosition = positions[(index + 1) % positions.length];
  return chain.participants.find((p) => p.position === nextPosition)?.vote ?? null;
}

// Мой голос второго раунда = решение участника на позиции, от которой я получаю (SOFT-LOCK §3.3).
// На 4.6 то же значение приезжает как receiveOptions[0].vote — здесь экраны 4.7/4.8.
export function myConfirmVote(chain: Chain): VoteValue | null {
  return confirmVoteAt(chain, chain.currentPosition);
}

// Счётчик согласий: соответствие «голосующий ↔ цель» биективно, поэтому сдвиг на счёт не влияет,
// а вне PROPOSED/FROZEN голос имеет другой смысл и не считается (SOFT-LOCK §3.3)
export function approvedVotes(chain: Chain): number {
  if (!isAssembled(chain.status)) return 0;
  return chain.participants.reduce((count, p) => count + (p.vote === 'approved' ? 1 : 0), 0);
}

// Собранной цепочке ещё нужно моё решение второго раунда (SOFT-LOCK §4): пока голос не approved —
// ни pending, ни thinking — кнопка «Требуются действия» (или inline-«Да»/«Нет») остаётся.
// После подтверждения действий нет — остаётся статусная строка «Вы подтвердили · ждём остальных»
export function needsMyAction(chain: Chain): boolean {
  return chain.status === 'PROPOSED' && myConfirmVote(chain) !== 'approved';
}

// Состояние экрана сделки (макет 4.9): чистый дискриминант из статуса цепочки и статусов заявок.
// «Отправил» = заявка участника уже не LOCKED; «я забрал» = у звена-источника заявка DONE
// (receipt переводит заявку источника в DONE, DEAL-PLAN.md §2.2). CANDIDATE/PROPOSED/BROKEN —
// сделки ещё нет: весь второй раунд живёт на 4.6/4.7/4.8, ссылки на /deal оттуда не появляется.
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
