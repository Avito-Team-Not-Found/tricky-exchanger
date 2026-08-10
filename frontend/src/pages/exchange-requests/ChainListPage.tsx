import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { useChainVote, ChainCard } from '@features/chains';

import { bestChainId, useExchangeOptions } from '@entities/chain';
import { useRequest } from '@entities/exchangeRequest';
import { useItems } from '@entities/item';

import { EmptyState, ErrorState } from '@shared/ui';

import './ChainListPage.scss';

// Варианты обмена по заявке (PROJECT.md §2.6, макет 4.6): пул кандидатов следующего звена,
// на каждого можно откликнуться или отозвать отклик.
export function ChainListPage() {
  const { requestId: requestIdParam } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const requestId = requestIdParam ? Number(requestIdParam) : undefined;
  const requestQuery = useRequest(requestId);
  const optionsQuery = useExchangeOptions(requestId);
  const itemsQuery = useItems();
  const { confirmVote, isVoting } = useChainVote();

  const request = requestQuery.data;
  const options = optionsQuery.data ?? [];
  // деталь заявки не отдаёт снимок отдаваемого товара — берём его из кеша товаров
  const offeredItem = itemsQuery.data?.items.find((item) => item.id === request?.offeredItemId);

  if (requestQuery.isLoading || optionsQuery.isLoading || itemsQuery.isLoading) {
    return (
      <div className="chain-list-page">
        <ChainListHeader onBack={() => navigate('/exchange-requests')} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (requestQuery.isError || optionsQuery.isError) {
    return (
      <div className="chain-list-page">
        <ChainListHeader onBack={() => navigate('/exchange-requests')} />
        <ErrorState
          onRetry={() => {
            void requestQuery.refetch();
            void optionsQuery.refetch();
          }}
        />
      </div>
    );
  }

  // бэкенд отдаёт цепочки по дате создания (repository.go: ORDER BY c.created_at DESC), а экран
  // показывает их по убыванию вероятности (DESIGN.md §4.6) — иначе лучшая цепочка с плашкой
  // оказывается в середине списка. Сортировка стабильная, поэтому варианты одной цепочки
  // сохраняют исходный порядок между собой
  const receiveOptions = options
    .flatMap((entry) => entry.receiveOptions.map((option) => ({ entry, option })))
    .sort((a, b) => b.entry.score - a.entry.score);
  const bestId = bestChainId(options);

  return (
    <div className="chain-list-page">
      <ChainListHeader onBack={() => navigate('/exchange-requests')} />
      <div className="chain-list-page__body">
        {request ? (
          <div className="chain-list-page__summary">
            {/* миниатюра отдаваемого товара — 40×40, radius-sm (макет 4.6) */}
            {offeredItem?.imageUrl ? (
              <img className="chain-list-page__summary-photo" src={offeredItem.imageUrl} alt="" />
            ) : (
              <div className="chain-list-page__summary-photo" aria-hidden />
            )}
            <div className="chain-list-page__summary-text">
              <p className="chain-list-page__summary-line">
                Отдаёте: {offeredItem?.title ?? 'Товар удалён'}
              </p>
              <p className="chain-list-page__summary-line chain-list-page__summary-line--muted">
                Получаете: {request.wantedDescription}
              </p>
            </div>
            <Button
              className="chain-list-page__edit"
              type="text"
              icon={<EditOutlined aria-hidden />}
              aria-label="Редактировать запрос"
              onClick={() => navigate(`/exchange-requests/${requestId}/edit`)}
            />
          </div>
        ) : null}

        {receiveOptions.length === 0 ? (
          <EmptyState
            title="Пока нет подходящих цепочек"
            description="Попробуйте изменить запрос позже"
          />
        ) : (
          <div className="chain-list-page__list">
            {receiveOptions.map(({ entry, option }) => (
              <ChainCard
                key={`${entry.chainId}-${option.requestId}`}
                options={entry}
                option={option}
                isBest={entry.chainId === bestId}
                isVoting={isVoting}
                onOpen={() => navigate(`/chains/${entry.chainId}`)}
                onVote={(active) =>
                  confirmVote(
                    {
                      chainId: entry.chainId,
                      requestId: entry.currentRequestId,
                      targetRequestId: option.requestId,
                    },
                    active,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChainListHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="chain-list-page__header">
      <Button
        className="chain-list-page__back"
        type="text"
        icon={<ArrowLeftOutlined aria-hidden />}
        aria-label="Назад"
        onClick={onBack}
      />
      <h1 className="chain-list-page__title">Варианты обмена</h1>
    </header>
  );
}
