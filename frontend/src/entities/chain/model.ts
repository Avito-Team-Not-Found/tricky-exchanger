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
