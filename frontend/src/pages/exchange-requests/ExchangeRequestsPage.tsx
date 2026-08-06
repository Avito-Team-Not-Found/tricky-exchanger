import { PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Skeleton } from 'antd';
import { useNavigate } from 'react-router';

import { RequestCard, useRemoveRequest } from '@features/exchange-requests';

import { isRequestEditable, useRequests, type ExchangeRequest } from '@entities/exchangeRequest';

import { EmptyState, ErrorState } from '@shared/ui';

import './ExchangeRequestsPage.scss';

export function ExchangeRequestsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useRequests();
  const removeRequest = useRemoveRequest();
  const { modal } = AntApp.useApp();

  function confirmRemove(request: ExchangeRequest) {
    modal.confirm({
      title: 'Отменить запрос?',
      content: `Запрос «${request.wantedDescription}» будет отменён.`,
      okText: 'Да, отменить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => removeRequest.mutate(request.id),
    });
  }

  const requests = data ?? [];

  return (
    <div className="requests-page">
      <div className="requests-page__title-row">
        <h1 className="requests-page__title">Мои запросы</h1>
        <Button
          className="requests-page__add"
          type="primary"
          shape="circle"
          icon={<PlusOutlined aria-hidden />}
          aria-label="Создать запрос"
          onClick={() => navigate('/exchange-requests/new')}
        />
      </div>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : requests.length === 0 ? (
        <EmptyState
          title="У вас нет запросов"
          description="Создайте запрос на обмен — сервис подберёт подходящие цепочки"
        >
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            onClick={() => navigate('/exchange-requests/new')}
          >
            Создать запрос
          </Button>
        </EmptyState>
      ) : (
        <div className="requests-page__list">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onClick={() => navigate(`/exchange-requests/${request.id}/edit`)}
              onRemove={
                isRequestEditable(request.status) ? () => confirmRemove(request) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
