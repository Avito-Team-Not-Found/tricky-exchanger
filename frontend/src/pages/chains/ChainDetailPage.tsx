import { Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { ChainItemView } from '@features/chains';

import { useCategories } from '@entities/category';
import { myParticipant, receivesItem, useChain } from '@entities/chain';

import { ErrorState } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainDetailPage.scss';

// Экран цепочки (макет 4.7): товар, который пользователь получит в обмене, и переход к схеме
// участников (макет 4.8). Заголовок страницы — название получаемого товара (макет 4.7).
export function ChainDetailPage() {
  const { chainId } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const { data: chain, isLoading, isError, refetch } = useChain(chainId);
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];

  const me = chain ? myParticipant(chain) : null;
  const received = chain && me ? receivesItem(me, chain) : null;
  const categoryName =
    categories.find((category) => category.id === received?.categoryId)?.name ?? null;

  const goBack = () => {
    if (chain?.requestId) navigate(`/exchange-requests/${chain.requestId}`);
    else navigate(-1);
  };

  return (
    <div className="chain-detail-page">
      <ChainPageHeader title={received?.title ?? 'Цепочка обмена'} onBack={goBack} />

      <div className="chain-detail-page__body">
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : isError || !chain ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <ChainItemView
            chain={chain}
            categoryName={categoryName}
            onOpenParticipants={() => navigate(`/chains/${chain.id}/participants`)}
          />
        )}
      </div>
    </div>
  );
}
