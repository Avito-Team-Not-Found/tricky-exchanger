import { Button } from 'antd';

import { DealBarcode } from './DealBarcode';

import './deal.scss';
import './DealDoneView.scss';

interface DealDoneViewProps {
  state: { status: 'received-waiting' } | { status: 'completed' };
  chainId: number;
  onOpenDetails: () => void;
  onGoToRequests: () => void;
}

export function DealDoneView({ state, chainId, onOpenDetails, onGoToRequests }: DealDoneViewProps) {
  const completed = state.status === 'completed';

  return (
    <div className="deal-done">
      <div className="deal-hero">
        <p className="deal-hero__icon" aria-hidden>
          {completed ? '📦' : '🎉'}
        </p>
        <p className="deal-hero__title">
          {completed ? 'Заберите свой товар' : 'Вы подтвердили товар'}
        </p>
        <p className="deal-hero__text">
          {completed
            ? 'Обмен прошёл успешно!'
            : 'Спасибо! Мы отметили, что товар вам подходит. Обмен завершится, как только все участники подтвердят получение.'}
        </p>
        {completed ? (
          <p className="deal-hero__text">Получите свой товар в пункте выдачи.</p>
        ) : (
          <p className="deal-hero__text">
            Забрать товар можно будет после подтверждения всеми участниками.
          </p>
        )}
      </div>

      {completed ? <DealBarcode chainId={chainId} kind="receipt" /> : null}

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
