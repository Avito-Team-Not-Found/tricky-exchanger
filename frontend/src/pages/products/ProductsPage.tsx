import { PlusOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { useNavigate } from 'react-router';

import { ProductCard } from '@features/items';

import { useItems } from '@entities/item';

import { EmptyState, ErrorState } from '@shared/ui';

import './ProductsPage.scss';

export function ProductsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useItems();

  const items = data?.items ?? [];
  const truncated = (data?.total ?? 0) > items.length;

  return (
    <div className="products-page">
      <div className="products-page__title-row">
        <h1 className="products-page__title">Товары</h1>
        <Button
          className="products-page__add"
          type="primary"
          shape="circle"
          icon={<PlusOutlined aria-hidden />}
          aria-label="Добавить товар"
          onClick={() => navigate('/products/new')}
        />
      </div>

      {isLoading ? (
        <div className="products-page__grid">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              key={index}
              active
              avatar={{ shape: 'square', size: 96 }}
              title={{ width: '80%' }}
              paragraph={false}
            />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          title="У вас пока нет товаров"
          description="Нажмите «+», чтобы добавить первый товар"
        >
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            onClick={() => navigate('/products/new')}
          >
            Добавить товар
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="products-page__grid motion-cascade">
            {items.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                onClick={() => navigate(`/products/${item.id}/edit`)}
              />
            ))}
          </div>
          {truncated ? (
            <p className="products-page__limit-note" role="status">
              Показаны первые {items.length} из {data?.total} товаров
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
