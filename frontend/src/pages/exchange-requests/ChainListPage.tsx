import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { useChainConfirm, useChainVote, useProposalExpiry, ChainCard } from '@features/chains';

import {
  approvedVotes,
  isAssembled,
  isHardLocked,
  useChains,
  useExchangeOptions,
  type Chain,
  type ExchangeOptions,
} from '@entities/chain';
import { useRequest } from '@entities/exchangeRequest';
import { useItems } from '@entities/item';

import { EmptyState, ErrorState } from '@shared/ui';

import './ChainListPage.scss';

// Варианты обмена по заявке: пул кандидатов следующего звена,
// на каждого можно откликнуться или отозвать отклик. Когда одна из цепочек замкнулась
// (PROPOSED) или заморожена — остальные варианты приглушены и недоступны; при заморозке
// сделки дополнительно баннер, а кнопка правки запроса заблокирована.
export function ChainListPage() {
  const { requestId: requestIdParam } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const requestId = requestIdParam ? Number(requestIdParam) : undefined;
  const requestQuery = useRequest(requestId);
  const optionsQuery = useExchangeOptions(requestId);
  const itemsQuery = useItems();
  const { confirmVote, isVoting } = useChainVote();
  const { openConfirm } = useChainConfirm();

  const request = requestQuery.data;
  const options = optionsQuery.data ?? [];
  const hasFrozen = options.some((entry) => isHardLocked(entry.status));
  // собранная или замороженная цепочка занимает заявку: кандидатные варианты приглушены
  const hasAssembled = options.some((entry) => isAssembled(entry.status));
  // деталь заявки не отдаёт снимок отдаваемого товара — берём его из кеша товаров
  const offeredItem = itemsQuery.data?.items.find((item) => item.id === request?.offeredItemId);

  // exchange-options не отдаёт ни число согласий второго раунда, ни дедлайны (ответа/отправки):
  // всё это для PROPOSED- и FROZEN-цепочек берётся из детали (GET /chains/{id}) — см.
  // approvedCountFor/deadlineAtFor
  const detailChainIds = options
    .filter((entry) => entry.status === 'PROPOSED' || entry.status === 'FROZEN')
    .map((entry) => entry.chainId);
  const detailQueries = useChains(detailChainIds);
  const detailByChain = new Map<number, Chain>();
  detailQueries.forEach((query, index) => {
    if (query.data) detailByChain.set(detailChainIds[index], query.data);
  });

  // exchange-options не откатывает просроченный PROPOSED (это делает только GET /chains/{id}),
  // поэтому после дедлайна список надо перезапросить — иначе карточка останется с живыми
  // кнопками второго раунда
  useProposalExpiry(
    options.map((entry) => ({
      chainId: entry.chainId,
      listStatus: entry.status,
      detailStatus: detailByChain.get(entry.chainId)?.status,
      deadlineAt: detailByChain.get(entry.chainId)?.freezeDeadlineAt,
    })),
  );

  function approvedCountFor(entry: ExchangeOptions): number | undefined {
    if (isHardLocked(entry.status)) return entry.length;
    const detail = detailByChain.get(entry.chainId);
    return detail ? approvedVotes(detail) : undefined;
  }

  function deadlineAtFor(entry: ExchangeOptions): string | null | undefined {
    return detailByChain.get(entry.chainId)?.freezeDeadlineAt;
  }

  if (requestQuery.isLoading || optionsQuery.isLoading || itemsQuery.isLoading) {
    return (
      <div className="chain-list-page">
        <ChainListHeader onBack={() => navigate('/exchange-requests')} />
        <div className="chain-list-page__body">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
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
  // показывает их по убыванию вероятности. Сортировка стабильная, поэтому
  // варианты одной цепочки сохраняют исходный порядок между собой
  const receiveOptions = options
    .flatMap((entry) => entry.receiveOptions.map((option) => ({ entry, option })))
    .sort((a, b) => b.entry.score - a.entry.score);

  return (
    <div className="chain-list-page">
      <ChainListHeader onBack={() => navigate('/exchange-requests')} />
      <div className="chain-list-page__body">
        {request ? (
          <div className="chain-list-page__summary">
            {/* миниатюра отдаваемого товара — 40×40, radius-sm */}
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
                isVoting={isVoting}
                locked={hasAssembled && !isAssembled(entry.status)}
                approvedCount={approvedCountFor(entry)}
                deadlineAt={deadlineAtFor(entry)}
                onOpen={() => navigate(`/chains/${entry.chainId}`)}
                onProceed={() => navigate(`/chains/${entry.chainId}/deal`)}
                onConfirm={(chainId) => openConfirm(chainId)}
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
