import { Button } from 'antd';

import './DealPickupCard.scss';

interface DealPickupCardProps {
  address: string;
  onChange?: () => void;
}

export function DealPickupCard({ address, onChange }: DealPickupCardProps) {
  return (
    <div className="deal-pickup">
      <span className="deal-pickup__icon" aria-hidden>
        📍
      </span>
      <div className="deal-pickup__text">
        <p className="deal-pickup__title">Пункт выдачи</p>
        <p className="deal-pickup__address">{address}</p>
      </div>
      {onChange ? (
        <Button className="deal-pickup__change" type="text" size="small" onClick={onChange}>
          Изменить
        </Button>
      ) : null}
    </div>
  );
}
