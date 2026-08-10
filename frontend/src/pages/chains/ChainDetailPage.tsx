import { Alert, Button, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { ChainItemView, useChainConfirm } from '@features/chains';

import { receivesItem, useChain, useReplacements } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

// Экран цепочки (макет 4.7): товар, который пользователь получит в обмене, и переход к схеме
// участников (макет 4.8). Заголовок страницы — название получаемого товара (макет 4.7).
export function ChainDetailPage() {
  const { chainId: chainIdParam } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const { data: chain, isLoading: isChainLoading, isError, refetch } = useChain(chainId);
  const { openConfirm } = useChainConfirm(refetch, () => navigate('/exchange-requests'));
  // баннер входа в замену — единственный корректный признак вакансии (TZ §2): в теле цепочки
  // отличий после отказа не видно
  const { data: replacements = [], isLoading: isReplacementsLoading } = useReplacements(chainId, {
    enabled: chain?.status === 'PROPOSED',
  });
  const isLoading = isChainLoading || isReplacementsLoading;
  // статус проверяем и здесь, а не только через enabled: выключенный запрос сохраняет прошлые
  // данные и не перезапрашивается, поэтому после ухода цепочки из PROPOSED (замену подтвердили)
  // непустой пул из кеша иначе продолжил бы звать выбирать замену на уже собранной цепочке
  const showReplacementBanner = chain?.status === 'PROPOSED' && replacements.length > 0;

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
              onOpenParticipants={() => navigate(`/chains/${chain.id}/participants`)}
              onConfirm={() => openConfirm(chain.id)}
              onProceed={() => navigate(`/chains/${chain.id}`)}
            />
          </>
        )}
      </div>
    </div>
  );
}
