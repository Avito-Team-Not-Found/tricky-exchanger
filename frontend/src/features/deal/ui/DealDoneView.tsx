import { Button } from 'antd';

import './deal.scss';
import './DealDoneView.scss';

interface DealDoneViewProps {
  state: { status: 'received-waiting' } | { status: 'completed' };
  onOpenDetails: () => void;
  onGoToRequests: () => void;
}

// Финальные состояния сделки: «Вы забрали товар» — ждём, пока остальные подтвердят
// получение, «Обмен завершён» — вся цепочка DONE. На завершённой цепочке спора и кнопок сделки
// нет — только переход к моим запросам и деталям. Статусы получения открываются кнопкой
// «Посмотреть детали цепочки».
export function DealDoneView({ state, onOpenDetails, onGoToRequests }: DealDoneViewProps) {
  const completed = state.status === 'completed';

  return (
    <div className="deal-done">
      <div className="deal-hero">
        <p className="deal-hero__icon" aria-hidden>
          {completed ? '✅' : '🎉'}
        </p>
        <p className="deal-hero__title">{completed ? 'Обмен завершён' : 'Вы забрали товар'}</p>
        <p className="deal-hero__text">
          {completed
            ? 'Все участники подтвердили получение. Ваш товар передан, а вы получили новый.'
            : 'Спасибо! Мы отметили, что вы забрали товар. Обмен завершится, как только все участники подтвердят получение.'}
        </p>
      </div>

      <div className="deal-actions">
        {completed ? (
          <Button type="primary" size="large" block onClick={onGoToRequests}>
            К моим запросам
          </Button>
        ) : null}
        <Button size="large" block onClick={onOpenDetails}>
          Посмотреть детали цепочки
        </Button>
      </div>
    </div>
  );
}
