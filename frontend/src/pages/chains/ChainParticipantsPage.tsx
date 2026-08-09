import { Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { ChainDetail, useChainConfirm, useChainVote } from '@features/chains';

import { useChain } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

// Схема участников цепочки (макет 4.8): строки по звеньям кольца с пулом кандидатов и
// откликами на получаемом звене. Открывается с экрана товара цепочки (макет 4.7).
export function ChainParticipantsPage() {
  const { chainId: chainIdParam } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const { data: chain, isLoading, isError, refetch } = useChain(chainId);
  const { confirmVote, isVoting } = useChainVote(refetch);
  const { openConfirm } = useChainConfirm(refetch, () => navigate('/exchange-requests'));

  return (
    <div className="chain-detail-page">
      <ChainPageHeader title="Цепочка обмена" onBack={() => navigate(`/chains/${chainId}`)} />

      <div className="chain-detail-page__body">
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : isError || !chain ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <ChainDetail
            chain={chain}
            isVoting={isVoting}
            onVote={(candidate, active) =>
              confirmVote(
                {
                  chainId: chain.id,
                  requestId: chain.currentRequestId,
                  targetRequestId: candidate.requestId,
                },
                active,
              )
            }
            onConfirm={() => openConfirm(chain.id)}
            onProceed={() => navigate(`/chains/${chain.id}`)}
          />
        )}
      </div>
    </div>
  );
}
