import { Button } from 'antd';

import type { RequestStatus } from '@entities/exchangeRequest';

import './DealTrackingModal.scss';

// Этапы трекинга. Событий и времени API не отдаёт — показываем фиксированный список,
// «пройденность» считаем по requestStatus участника, без дат:
// LOCKED — ничего, IN_PROGRESS — всё до «Доставлено в пункт выдачи», DONE — ещё и «Получено».
const DELIVERY_STEPS = [
  'Принято в отделении',
  'Отправлено в сортировочный центр',
  'Прибыло в сортировочный центр',
  'Выехало в пункт выдачи',
  'Доставлено в пункт выдачи',
  'Получено',
];

const PASSED_BY_STATUS: Record<RequestStatus, number> = {
  ACTIVE: 0,
  IN_PROPOSAL: 0,
  LOCKED: 0,
  IN_PROGRESS: DELIVERY_STEPS.length - 1,
  DONE: DELIVERY_STEPS.length,
};

interface DealTrackingModalProps {
  title: string;
  status: RequestStatus;
  onClose: () => void;
}

export function DealTrackingModal({ title, status, onClose }: DealTrackingModalProps) {
  const passed = PASSED_BY_STATUS[status] ?? 0;

  return (
    <div className="deal-tracking">
      <p className="deal-tracking__title">{title}</p>
      {status === 'LOCKED' ? (
        <p className="deal-tracking__waiting" role="status">
          Отправитель ещё не принёс товар
        </p>
      ) : null}
      <ol className="deal-tracking__steps">
        {DELIVERY_STEPS.map((step, index) => (
          <li
            key={step}
            className={[
              'deal-tracking__step',
              index < passed ? 'deal-tracking__step--passed' : '',
              index === passed - 1 ? 'deal-tracking__step--current' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="deal-tracking__marker" aria-hidden>
              <span className="deal-tracking__dot" />
              {index < DELIVERY_STEPS.length - 1 ? <span className="deal-tracking__line" /> : null}
            </span>
            <span className="deal-tracking__label">{step}</span>
          </li>
        ))}
      </ol>
      <Button className="deal-tracking__button" type="primary" block onClick={onClose}>
        Понятно
      </Button>
    </div>
  );
}
