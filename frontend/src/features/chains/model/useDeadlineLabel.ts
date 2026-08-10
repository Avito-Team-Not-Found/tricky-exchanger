import { useEffect, useState } from 'react';

import { formatRemaining, type ChainStatus } from '@entities/chain';

// тик раз в 30 с — минутного разрешения макета («47 ч 58 мин») достаточно, а серверный рефетч
// обновляет сам дедлайн; без локального тика строка застыла бы (DEADLINE-PLAN Р3)
const TICK_MS = 30_000;

// Метка дедлайна ответа по собранной цепочке (макет 4.6/4.7): «Осталось 47 ч 58 мин на ответ».
// Гейт по PROPOSED обязателен: freezeDeadlineAt переиспользуется стадией FROZEN под дедлайн
// отправки товара (FreezeTTL) — вне PROPOSED показывать таймер нельзя (DEADLINE-PLAN §1.5)
export function useDeadlineLabel(
  status: ChainStatus,
  deadlineAt: string | null | undefined,
): string | null {
  const [now, setNow] = useState(() => Date.now());
  const visible = status === 'PROPOSED' && Boolean(deadlineAt);

  useEffect(() => {
    if (!visible) return;
    // now переживает невидимый период до прихода дедлайна — первый тик сразу, а не через TICK_MS
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timeout = setTimeout(tick, TICK_MS);
    };
    timeout = setTimeout(tick, 0);
    return () => clearTimeout(timeout);
  }, [visible]);

  return visible ? formatRemaining(deadlineAt, now) : null;
}
