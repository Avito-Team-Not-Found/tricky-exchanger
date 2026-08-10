import { Button } from 'antd';

import './DealPickupCard.scss';

interface DealPickupCardProps {
  address: string;
  // кнопка «Изменить» есть только на экране отправки — там пользователь вправе выбрать свой ПВЗ
  onChange?: () => void;
}

// Карточка пункта выдачи (макет 4.9): иконка, название и адрес; адрес — клиентская имитация
// (DEAL-PLAN.md §4.1), на бэкенде его нет.
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
