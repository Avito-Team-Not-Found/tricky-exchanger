import type { ChainStatus } from '@entities/chain';

import { useDeadlineLabel, type DeadlinePurpose } from '../model/useDeadlineLabel';

import './DeadlineRow.scss';

interface DeadlineRowProps {
  status: ChainStatus;
  deadlineAt?: string | null;
  // показывать на FROZEN и дедлайн отправки товара (тот же freezeDeadlineAt) — карточка списка
  // вариантов; экран цепочки оставляет прежнее поведение, только дедлайн ответа на PROPOSED
  showShipDeadline?: boolean;
}

// Таймер дедлайна цепочки (TimerRow): на PROPOSED — «Осталось … на ответ», на FROZEN с
// showShipDeadline — «Осталось … на отправку». Рендерит null, когда метки нет (статус не подходит
// или дедлайн не задан/прошёл) — вызывающим экранам не нужно дублировать условие.
// role="status" не ставим: живой регион, обновляемый раз в 30 с, постоянно перебивал бы скринридер
export function DeadlineRow({ status, deadlineAt, showShipDeadline }: DeadlineRowProps) {
  const purpose: DeadlinePurpose | null =
    status === 'PROPOSED' ? 'response' : showShipDeadline && status === 'FROZEN' ? 'ship' : null;
  const label = useDeadlineLabel(purpose, deadlineAt);
  if (!label) return null;
  return (
    <p className="deadline-row">
      <span className="deadline-row__icon" aria-hidden>
        ⏱
      </span>
      Осталось {label} {purpose === 'ship' ? 'на отправку' : 'на ответ'}
    </p>
  );
}
