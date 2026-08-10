import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { useChainConfirm, useChainVote, ChainCard } from '@features/chains';

import {
  approvedVotes,
  bestChainId,
  isAssembled,
  isHardLocked,
  useChains,
  useExchangeOptions,
  type ExchangeOptions,
} from '@entities/chain';
import { useRequest } from '@entities/exchangeRequest';
import { useItems } from '@entities/item';

import { EmptyState, ErrorState } from '@shared/ui';

import './ChainListPage.scss';

// Варианты обмена по заявке (PROJECT.md §2.6, макет 4.6): пул кандидатов следующего звена,
// на каждого можно откликнуться или отозвать отклик. Когда одна из цепочек замкнулась
// (PROPOSED) или заморожена — остальные варианты приглушены и недоступны; при заморозке
// сделки дополнительно баннер, а кнопка правки запроса заблокирована (SOFT-LOCK §5.4/§5.5).
export function ChainListPage() {
  const { requestId: requestIdParam } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const requestId = requestIdParam ? Number(requestIdParam) : undefined;
  const requestQuery = useRequest(requestId);
  const optionsQuery = useExchangeOptions(requestId);
  const itemsQuery = useItems();
  const { confirmVote, isVoting } = useChainVote();
  const { openConfirm, confirmNow, openDecline, isConfirming } = useChainConfirm();

  const request = requestQuery.data;
  const options = optionsQuery.data ?? [];
  const hasFrozen = options.some((entry) => isHardLocked(entry.status));
  // собранная или замороженная цепочка занимает заявку: кандидатные варианты приглушены
  const hasAssembled = options.some((entry) => isAssembled(entry.status));
  // деталь заявки не отдаёт снимок отдаваемого товара — берём его из кеша товаров
  const offeredItem = itemsQuery.data?.items.find((item) => item.id === request?.offeredItemId);

  // exchange-options не отдаёт число согласий второго раунда: для PROPOSED-цепочек оно
  // считается из participants[].vote детали (GET /chains/{id}) — см. approvedCountFor
  const proposedChainIds = options
    .filter((entry) => entry.status === 'PROPOSED')
    .map((entry) => entry.chainId);
  const proposedQueries = useChains(proposedChainIds);
  const approvedByChain = new Map<number, number>();
  proposedQueries.forEach((query, index) => {
    if (query.data) approvedByChain.set(proposedChainIds[index], approvedVotes(query.data));
  });

  function approvedCountFor(entry: ExchangeOptions): number | undefined {
    if (isHardLocked(entry.status)) return entry.length;
    return approvedByChain.get(entry.chainId);
  }

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
              aria-label={hasFrozen ? 'Заявка заблокирована сделкой' : 'Редактировать запрос'}
              title={hasFrozen ? 'Заявка заблокирована сделкой' : undefined}
              disabled={hasFrozen}
              onClick={() => navigate(`/exchange-requests/${requestId}/edit`)}
            />
          </div>
        ) : null}

        {hasFrozen ? (
          <p className="chain-list-page__banner" role="status">
            Сделка по одной из цепочек уже согласована. Остальные варианты недоступны.
          </p>
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
                isConfirming={isConfirming}
                locked={hasAssembled && !isAssembled(entry.status)}
                approvedCount={approvedCountFor(entry)}
                onOpen={() => navigate(`/chains/${entry.chainId}`)}
                onConfirm={(chainId) => openConfirm(chainId)}
                onConfirmNow={(chainId) => confirmNow(chainId)}
                onDecline={(chainId) => openDecline(chainId)}
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
