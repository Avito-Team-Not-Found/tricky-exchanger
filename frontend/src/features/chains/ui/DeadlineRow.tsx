import type { ChainStatus } from '@entities/chain';

import { useDeadlineLabel } from '../model/useDeadlineLabel';

import './DeadlineRow.scss';

interface DeadlineRowProps {
  status: ChainStatus;
  deadlineAt?: string | null;
}

// Таймер дедлайна ответа по собранной цепочке (TimerRow): «Осталось … на ответ».
// Рендерит null, когда метки нет (статус не PROPOSED или дедлайн не задан/прошёл) — вызывающим
// экранам не нужно дублировать условие. role="status" не ставим: живой регион, обновляемый раз
// в 30 с, постоянно перебивал бы скринридер
export function DeadlineRow({ status, deadlineAt }: DeadlineRowProps) {
  const label = useDeadlineLabel(status, deadlineAt);
  if (!label) return null;
  return (
    <p className="deadline-row">
      <span className="deadline-row__icon" aria-hidden>
        ⏱
      </span>
      Осталось {label} на ответ
    </p>
  );
}
