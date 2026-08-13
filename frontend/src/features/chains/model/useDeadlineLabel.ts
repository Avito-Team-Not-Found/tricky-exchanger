import { useSyncExternalStore } from 'react';

import { formatRemaining, isFrozenReplacement, needsMyAction, type Chain } from '@entities/chain';

// тик раз в 30 с — минутного разрешения достаточно («47 ч 58 мин»), а серверный рефетч
// обновляет сам дедлайн; без локального тика строка застыла бы
const TICK_MS = 30_000;

// все дедлайны лежат в freezeDeadlineAt и различаются только статусом цепочки/причиной,
// поэтому выбор остаётся за вызывающим компонентом
export type DeadlinePurpose = 'response' | 'ship' | 'replacement';

// дедлайн замены общий, но приглашённому кандидату он отсчитывает срок ответа
export function chainDeadlinePurpose(chain: Chain): DeadlinePurpose | undefined {
  if (!isFrozenReplacement(chain)) return undefined;
  return needsMyAction(chain) ? 'response' : 'replacement';
}

// внешний стор, а не useState с интервалом: Date.now() нельзя читать прямо в рендере, а снимок
// обновляется ещё и в момент подписки — дедлайн, пришедший позже монтирования карточки,
// считается от текущего времени. Интервал при этом один на страницу
let snapshot = Date.now();
let interval: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribeToClock(listener: () => void): () => void {
  snapshot = Date.now();
  listeners.add(listener);
  if (interval === undefined) {
    interval = setInterval(() => {
      snapshot = Date.now();
      listeners.forEach((notify) => notify());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(interval);
      interval = undefined;
    }
  };
}

function subscribeToNothing(): () => void {
  return () => {};
}

function readClock(): number {
  return snapshot;
}

export function useDeadlineLabel(
  purpose: DeadlinePurpose | null,
  deadlineAt: string | null | undefined,
): string | null {
  const visible = purpose !== null && Boolean(deadlineAt);
  const now = useSyncExternalStore(visible ? subscribeToClock : subscribeToNothing, readClock);

  return visible ? formatRemaining(deadlineAt, now) : null;
}
