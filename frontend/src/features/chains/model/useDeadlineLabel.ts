import { useSyncExternalStore } from 'react';

import { formatRemaining } from '@entities/chain';

// тик раз в 30 с — минутного разрешения достаточно («47 ч 58 мин»), а серверный рефетч
// обновляет сам дедлайн; без локального тика строка застыла бы
const TICK_MS = 30_000;

// Что именно считаем: дедлайн ответа второго раунда (PROPOSED) или дедлайн отправки товара
// (FROZEN). Оба поля — freezeDeadlineAt, смысл зависит от статуса, поэтому выбор остаётся за
// вызывающим компонентом; null — таймер не показываем (подписка-заглушка не заводит интервал)
export type DeadlinePurpose = 'response' | 'ship';

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

// показывать нечего — подписка-заглушка не заводит интервал
function subscribeToNothing(): () => void {
  return () => {};
}

function readClock(): number {
  return snapshot;
}

// Остаток до дедлайна: «47 ч 58 мин» (формат — formatRemaining). Субтитл «на ответ»/«на отправку»
// добавляет компонент (DeadlineRow), хук возвращает только само время.
export function useDeadlineLabel(
  purpose: DeadlinePurpose | null,
  deadlineAt: string | null | undefined,
): string | null {
  const visible = purpose !== null && Boolean(deadlineAt);
  const now = useSyncExternalStore(visible ? subscribeToClock : subscribeToNothing, readClock);

  return visible ? formatRemaining(deadlineAt, now) : null;
}
