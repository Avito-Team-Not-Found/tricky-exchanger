import { ITEM_STATUS_META, type Item } from '@entities/item';

import { FadeInImage, StatusTag } from '@shared/ui';

import './ProductCard.scss';

interface ProductCardProps {
  item: Item;
  onClick: () => void;
}

export function ProductCard({ item, onClick }: ProductCardProps) {
  const statusMeta = ITEM_STATUS_META[item.status];

  return (
    <article
      className="product-card"
      role="button"
      tabIndex={0}
      aria-label={
        item.category
          ? `${item.title}, ${item.category}, ${statusMeta.label}`
          : `${item.title}, ${statusMeta.label}`
      }
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="product-card__photo">
        {item.imageUrl ? (
          <FadeInImage className="product-card__image" src={item.imageUrl} alt={item.title} />
        ) : (
          <div className="product-card__placeholder" aria-hidden />
        )}
        <div className="product-card__status">
          <StatusTag tone={statusMeta.tone}>{statusMeta.label}</StatusTag>
        </div>
      </div>
      <div className="product-card__body">
        <p className="product-card__title">{item.title}</p>
        {/* категория есть не у всех товаров — у созданных до перехода на текстовую категорию она пустая */}
        {item.category ? <p className="product-card__category">{item.category}</p> : null}
      </div>
    </article>
  );
}
