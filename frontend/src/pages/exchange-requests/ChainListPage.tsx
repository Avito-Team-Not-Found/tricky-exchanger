import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { useChainActions, ChainCard } from '@features/chains';

import { useRequestChains } from '@entities/chain';
import { useRequest } from '@entities/exchangeRequest';

import { EmptyState, ErrorState } from '@shared/ui';

import './ChainListPage.scss';

// Варианты обмена по заявке (PROJECT.md §2.6, макет 4.6): кандидатные цепочки, на каждую можно
// откликнуться «принять/отказаться», готовую — выбрать и перевести в PROPOSED.
export function ChainListPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const requestQuery = useRequest(requestId);
  const chainsQuery = useRequestChains(requestId);
  const { chooseChain, confirmCancelChoice, isSelecting } = useChainActions();

  const request = requestQuery.data;
  const chains = chainsQuery.data ?? [];

  if (requestQuery.isLoading || chainsQuery.isLoading) {
    return (
      <div className="chain-list-page">
        <ChainListHeader onBack={() => navigate('/exchange-requests')} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (requestQuery.isError || chainsQuery.isError) {
    return (
      <div className="chain-list-page">
        <ChainListHeader onBack={() => navigate('/exchange-requests')} />
        <ErrorState
          onRetry={() => {
            void requestQuery.refetch();
            void chainsQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="chain-list-page">
      <ChainListHeader onBack={() => navigate('/exchange-requests')} />
      <div className="chain-list-page__body">
        {request ? (
          <div className="chain-list-page__summary">
            {/* миниатюра отдаваемого товара — 40×40, radius-sm (макет 4.6) */}
            {request.offeredItem?.image ? (
              <img
                className="chain-list-page__summary-photo"
                src={request.offeredItem.image}
                alt=""
              />
            ) : (
              <div className="chain-list-page__summary-photo" aria-hidden />
            )}
            <div className="chain-list-page__summary-text">
              <p className="chain-list-page__summary-line">
                Отдаёте: {request.offeredItem?.title ?? 'Товар удалён'}
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

        {chains.length === 0 ? (
          <EmptyState
            title="Пока нет подходящих цепочек"
            description="Попробуйте изменить запрос позже"
          />
        ) : (
          <div className="chain-list-page__list">
            {chains.map((chain) => (
              <ChainCard
                key={chain.id}
                chain={chain}
                isSelecting={isSelecting}
                onOpen={() => navigate(`/chains/${chain.id}`)}
                onSelect={() => chooseChain(chain)}
                onDeselect={() => confirmCancelChoice(chain)}
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
