import { useSyncExternalStore } from 'react';

import { formatRemaining, type ChainStatus } from '@entities/chain';

// тик раз в 30 с — минутного разрешения достаточно («47 ч 58 мин»), а серверный рефетч
// обновляет сам дедлайн; без локального тика строка застыла бы
const TICK_MS = 30_000;

// Общие часы всех таймеров экрана. Внешний стор, а не useState с интервалом, по двум причинам:
// читать Date.now() прямо в рендере нельзя (правила чистоты React), а снимок обновляется ещё и
// в момент подписки — поэтому дедлайн, пришедший позже монтирования карточки (деталь цепочки
// догружается отдельным запросом), сразу считается от текущего времени, а не от времени
// монтирования. Интервал один на страницу: таких карточек может быть несколько.
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

// вне PROPOSED считать нечего — подписка-заглушка не заводит интервал
function subscribeToNothing(): () => void {
  return () => {};
}

function readClock(): number {
  return snapshot;
}

// Метка дедлайна ответа по собранной цепочке: «Осталось 47 ч 58 мин на ответ».
// Гейт по PROPOSED обязателен: freezeDeadlineAt переиспользуется стадией FROZEN под дедлайн
// отправки товара (FreezeTTL) — вне PROPOSED показывать таймер нельзя
export function useDeadlineLabel(
  status: ChainStatus,
  deadlineAt: string | null | undefined,
): string | null {
  const visible = status === 'PROPOSED' && Boolean(deadlineAt);
  const now = useSyncExternalStore(visible ? subscribeToClock : subscribeToNothing, readClock);

  return visible ? formatRemaining(deadlineAt, now) : null;
}
