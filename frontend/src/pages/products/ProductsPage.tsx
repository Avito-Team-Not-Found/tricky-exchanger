import { PlusOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { useNavigate } from 'react-router';

import { ProductCard } from '@features/items';

import { useItemsPage } from '@entities/item';

import { EmptyState, ErrorState } from '@shared/ui';

import './ProductsPage.scss';

export function ProductsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useItemsPage();

  const items = data?.pages.flatMap((page) => page.items) ?? [];

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
      ) : items.length > 0 ? (
        // при провале подгрузки следующей страницы useInfiniteQuery выставляет isError,
        // даже когда данные уже есть — сетку не заменяем экраном ошибки
        <>
          <div className="products-page__grid">
            {items.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                onClick={() => navigate(`/products/${item.id}/edit`)}
              />
            ))}
          </div>
          {hasNextPage ? (
            <Button
              className="products-page__more"
              block
              loading={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              Показать ещё
            </Button>
          ) : null}
        </>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
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
      )}
    </div>
  );
}
