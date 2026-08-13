import { Button } from 'antd';

import './deal.scss';
import './DealDoneView.scss';

interface DealDoneViewProps {
  state: { status: 'received-waiting' } | { status: 'completed' };
  onOpenDetails: () => void;
  onGoToRequests: () => void;
}

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
        {completed ? (
          <p className="deal-hero__text">У вас есть 24 часа на возврат товара.</p>
        ) : (
          <>
            <p className="deal-hero__text">Не используйте товар, пока не подтвердят получение.</p>
            <p className="deal-hero__text">
              После получения всеми участниками товара у вас будет 24 часа на возврат.
            </p>
          </>
        )}
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
