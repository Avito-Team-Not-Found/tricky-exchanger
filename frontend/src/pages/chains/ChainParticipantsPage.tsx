import { Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import {
  ChainDetail,
  ExpiredChainState,
  isChainExpired,
  receiveOptionQuery,
  useChainConfirm,
  useReceiveOption,
} from '@features/chains';

import { useChain } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

export function ChainParticipantsPage() {
  const { chainId: chainIdParam } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const receiveRequestId = useReceiveOption();
  const { data: chain, isLoading, isError, error, refetch } = useChain(chainId);
  const { openConfirm } = useChainConfirm(
    refetch,
    () => navigate('/exchange-requests'),
    { suppressExpiryToast: true },
  );

  return (
    <div className="chain-detail-page">
      <ChainPageHeader
        title="Цепочка обмена"
        onBack={() => navigate(`/chains/${chainId}${receiveOptionQuery(receiveRequestId)}`)}
      />

      <div className="chain-detail-page__body">
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : isChainExpired(error) ? (
          <ExpiredChainState />
        ) : isError || !chain ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <ChainDetail
            chain={chain}
            receiveRequestId={receiveRequestId}
            onConfirm={() => openConfirm(chain.id)}
            onProceed={() => navigate(`/chains/${chain.id}/deal`)}
          />
        )}
      </div>
    </div>
  );
}
