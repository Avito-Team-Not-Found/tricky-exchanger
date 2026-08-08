import { Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { ChainItemView } from '@features/chains';

import { receivesItem, useChain } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

// Экран цепочки (макет 4.7): товар, который пользователь получит в обмене, и переход к схеме
// участников (макет 4.8). Заголовок страницы — название получаемого товара (макет 4.7).
export function ChainDetailPage() {
  const { chainId: chainIdParam } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const { data: chain, isLoading, isError, refetch } = useChain(chainId);

  const received = chain ? receivesItem(chain) : [];
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
          <ChainItemView
            chain={chain}
            onOpenParticipants={() => navigate(`/chains/${chain.id}/participants`)}
          />
        )}
      </div>
    </div>
  );
}
