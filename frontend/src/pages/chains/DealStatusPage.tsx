import { Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { ParticipantStatusList, type DealStatusMode } from '@features/deal';

import { useChain } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

// Статусы отправки/получения (/chains/:chainId/deal/shipments|receipts): один список
// участников с пилюлей по mode. Псевдонимы вместо имён — правило анонимности сквозное.
export function DealStatusPage() {
  const { chainId: chainIdParam, mode: modeParam } = useParams<{
    chainId: string;
    mode: string;
  }>();
  const navigate = useNavigate();
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const { data: chain, isLoading, isError, refetch } = useChain(chainId);
  const statusMode: DealStatusMode = modeParam === 'receipts' ? 'receipts' : 'shipments';
  const title = statusMode === 'receipts' ? 'Статусы получения' : 'Статусы отправки';

  return (
    <div className="chain-detail-page">
      <ChainPageHeader title={title} onBack={() => navigate(`/chains/${chainId}/deal`)} />
      <div className="chain-detail-page__body">
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : isError || !chain ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <ParticipantStatusList chain={chain} mode={statusMode} />
        )}
      </div>
    </div>
  );
}
