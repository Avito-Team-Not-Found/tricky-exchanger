import { Skeleton } from 'antd';
import { Navigate, useNavigate, useParams } from 'react-router';

import { DealDoneView, DealShipView, DealTransitView } from '@features/deal';

import { dealState, useChain } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

// до заморозки сделки ещё нет — открытый по прямой ссылке экран уводит на детали цепочки
export function DealPage() {
  const { chainId: chainIdParam } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const { data: chain, isLoading, isError, refetch } = useChain(chainId);
  const state = chain ? dealState(chain) : null;

  const goBack = () => navigate(`/chains/${chainId}`);
  // «Посмотреть детали цепочки» ведёт сразу в статусы (отправки на экранах отправки, получения —
  // на экранах получения) — отдельной ссылки на них больше нет, а детали цепочки открываются «Назад»
  const goToShipments = () => navigate(`/chains/${chainId}/deal/shipments`);
  const goToReceipts = () => navigate(`/chains/${chainId}/deal/receipts`);

  if (isLoading) {
    return (
      <div className="chain-detail-page">
        <ChainPageHeader title="Сделка" onBack={goBack} />
        <div className="chain-detail-page__body">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (isError || !chain || !state) {
    return (
      <div className="chain-detail-page">
        <ChainPageHeader title="Сделка" onBack={goBack} />
        <div className="chain-detail-page__body">
          <ErrorState onRetry={refetch} />
        </div>
      </div>
    );
  }

  if (state.status === 'unavailable') {
    return <Navigate to={`/chains/${chainId}`} replace />;
  }

  return (
    <div className="chain-detail-page">
      <ChainPageHeader title="Сделка" onBack={goBack} />
      <div className="chain-detail-page__body">
        {state.status === 'ship' ? (
          <DealShipView chain={chain} deadlineAt={state.deadlineAt} onOpenDetails={goToShipments} />
        ) : state.status === 'shipped-waiting' || state.status === 'in-transit' ? (
          <DealTransitView chain={chain} state={state} onOpenDetails={goToShipments} />
        ) : (
          <DealDoneView
            state={state}
            onOpenDetails={goToReceipts}
            onGoToRequests={() => navigate('/exchange-requests')}
          />
        )}
      </div>
    </div>
  );
}
