import { ArrowRightOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import { REQUEST_STATUS_META, type ExchangeRequest } from '@entities/exchangeRequest';

import { StatusTag } from '@shared/ui';

import './RequestCard.scss';

interface RequestCardProps {
  request: ExchangeRequest;
  onClick: () => void;
  onRemove?: () => void;
}

export function RequestCard({ request, onClick, onRemove }: RequestCardProps) {
  const statusMeta = REQUEST_STATUS_META[request.status];

  return (
    <article
      className="request-card"
      role="button"
      tabIndex={0}
      aria-label={`Запрос: ${request.offeredItem?.title ?? 'товар'} → ${request.wantedDescription}`}
      onClick={onClick}
      onKeyDown={(event) => {
        // клавиши Enter/Space внутри кнопки удаления не должны открывать карточку (перехват сам делает Button)
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="request-card__thumb">
        {request.offeredItem?.image ? (
          <img
            className="request-card__image"
            src={request.offeredItem.image}
            alt={request.offeredItem.title}
          />
        ) : (
          <div className="request-card__placeholder" aria-hidden />
        )}
      </div>
      <div className="request-card__col">
        <div className="request-card__swap">
          <span className="request-card__offer">
            {request.offeredItem?.title ?? 'Товар удалён'}
          </span>
          <ArrowRightOutlined className="request-card__arrow" aria-hidden />
          <span className="request-card__want">{request.wantedDescription}</span>
        </div>
        <StatusTag tone={statusMeta.tone}>{statusMeta.label}</StatusTag>
      </div>
      {onRemove ? (
        <Button
          className="request-card__remove"
          type="text"
          icon={<DeleteOutlined aria-hidden />}
          aria-label={`Удалить запрос: ${request.wantedDescription}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        />
      ) : null}
    </article>
  );
}
