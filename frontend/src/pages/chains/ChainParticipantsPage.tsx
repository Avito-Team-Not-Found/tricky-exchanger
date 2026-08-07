import { Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { ChainDetail, useChainActions } from '@features/chains';

import { useChain } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

// Схема участников цепочки (макет 4.8): строки участников и их отклики, а при готовности —
// выбор цепочки (canSelect). Открывается с экрана товара цепочки (макет 4.7).
export function ChainParticipantsPage() {
  const { chainId } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const { data: chain, isLoading, isError, refetch } = useChain(chainId);
  const { confirmResponse, chooseChain, confirmCancelChoice, isResponding, isSelecting } =
    useChainActions(refetch);

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
            isResponding={isResponding}
            isSelecting={isSelecting}
            onRespond={(kind) => confirmResponse(chain, kind)}
            onSelect={() => chooseChain(chain)}
            onDeselect={() => confirmCancelChoice(chain)}
          />
        )}
      </div>
    </div>
  );
}
