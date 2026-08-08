import { ITEM_STATUS_META, type Item } from '@entities/item';

import { publicImageUrl } from '@shared/lib/imageUrl';
import { StatusTag } from '@shared/ui';

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
      aria-label={`${item.title}, ${statusMeta.label}`}
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
          <img
            className="product-card__image"
            src={publicImageUrl(item.imageUrl)}
            alt={item.title}
          />
        ) : (
          <div className="product-card__placeholder" aria-hidden />
        )}
        <div className="product-card__status">
          <StatusTag tone={statusMeta.tone}>{statusMeta.label}</StatusTag>
        </div>
      </div>
      <p className="product-card__title">{item.title}</p>
    </article>
  );
}
