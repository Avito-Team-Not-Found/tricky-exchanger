import { PlusOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { useNavigate } from 'react-router';

import { RequestCard } from '@features/exchange-requests';

import { useRequests } from '@entities/exchangeRequest';

import { EmptyState, ErrorState } from '@shared/ui';

import './ExchangeRequestsPage.scss';

export function ExchangeRequestsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useRequests();

  const requests = data ?? [];

  // тап по карточке открывает «Варианты обмена» (PROJECT.md §2.6), редактирование — кнопкой на той странице
  const openRequest = (requestId: number) => navigate(`/exchange-requests/${requestId}`);

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
              onClick={() => openRequest(request.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
