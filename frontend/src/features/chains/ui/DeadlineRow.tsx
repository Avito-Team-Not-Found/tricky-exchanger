import type { ChainStatus } from '@entities/chain';

import { useDeadlineLabel, type DeadlinePurpose } from '../model/useDeadlineLabel';

import './DeadlineRow.scss';

interface DeadlineRowProps {
  status: ChainStatus;
  deadlineAt?: string | null;
  // дедлайн отправки показывает только карточка списка вариантов
  showShipDeadline?: boolean;
  // приоритетнее автоопределения по статусу (см. chainDeadlinePurpose)
  purpose?: DeadlinePurpose;
}

// без метки рендерит null, чтобы вызывающие экраны не дублировали условие; role="status" не
// ставим — живой регион, обновляемый раз в 30 с, постоянно перебивал бы скринридер
export function DeadlineRow({ status, deadlineAt, showShipDeadline, purpose }: DeadlineRowProps) {
  const auto: DeadlinePurpose | null =
    status === 'PROPOSED' ? 'response' : showShipDeadline && status === 'FROZEN' ? 'ship' : null;
  const resolved = purpose ?? auto;
  const label = useDeadlineLabel(resolved, deadlineAt);
  if (!label) return null;
  const suffix =
    resolved === 'ship' ? 'на отправку' : resolved === 'replacement' ? 'на замену' : 'на ответ';
  return (
    <p className="deadline-row">
      <span className="deadline-row__icon" aria-hidden>
        ⏱
      </span>
      Осталось {label} {suffix}
    </p>
  );
}
