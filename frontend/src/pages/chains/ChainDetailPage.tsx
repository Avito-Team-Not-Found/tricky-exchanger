import { Alert, Button, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import {
  ChainItemView,
  receiveOptionQuery,
  useChainConfirm,
  useChainVote,
  useProposalExpiry,
  useReceiveOption,
} from '@features/chains';

import { receivesItem, useChain, useReplacements } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

export function ChainDetailPage() {
  const { chainId: chainIdParam } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const receiveRequestId = useReceiveOption();
  const { data: chain, isLoading: isChainLoading, isError, refetch } = useChain(chainId);
  const { confirmVote, isVoting } = useChainVote(refetch);
  const { openConfirm } = useChainConfirm(refetch, () => navigate('/exchange-requests'));

  // непустой пул — единственный признак вакансии: в теле цепочки отличий после отказа не видно
  const { data: replacements = [], isLoading: isReplacementsLoading } = useReplacements(chainId, {
    enabled: chain?.status === 'PROPOSED',
  });
  const isLoading = isChainLoading || isReplacementsLoading;
  // выключенный запрос сохраняет прошлые данные, поэтому статус проверяем и здесь: иначе пул
  // из кеша продолжит звать выбирать замену на уже собранной цепочке
  const showReplacementBanner = chain?.status === 'PROPOSED' && replacements.length > 0;

  useProposalExpiry(
    chain
      ? [{ chainId: chain.id, detailStatus: chain.status, deadlineAt: chain.freezeDeadlineAt }]
      : [],
  );

  const received = chain ? receivesItem(chain, receiveRequestId) : [];
  const single = received.length === 1 ? received[0] : null;
  const title =
    single?.offeredItemTitle ?? (received.length > 1 ? 'Варианты обмена' : 'Цепочка обмена');

  const goBack = () => {
    if (chain?.currentRequestId) navigate(`/exchange-requests/${chain.currentRequestId}`);
    else navigate(-1);
  };

  return (
    <div className="chain-detail-page">
      <ChainPageHeader title={title} onBack={goBack} />

      <div className="chain-detail-page__body">
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : isError || !chain ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <>
            {showReplacementBanner ? (
              <Alert
                type="warning"
                showIcon
                message="Участник отказался. Выберите замену, чтобы продолжить обмен"
                action={
                  <Button onClick={() => navigate(`/chains/${chain.id}/replacement`)}>
                    Выбрать замену
                  </Button>
                }
              />
            ) : null}
            <ChainItemView
              chain={chain}
              receiveRequestId={receiveRequestId}
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
              onOpenParticipants={() =>
                navigate(`/chains/${chain.id}/participants${receiveOptionQuery(receiveRequestId)}`)
              }
              onConfirm={() => openConfirm(chain.id)}
              onProceed={() => navigate(`/chains/${chain.id}/deal`)}
            />
          </>
        )}
      </div>
    </div>
  );
}
