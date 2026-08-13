import type { KeyboardEvent } from 'react';

import { ITEM_STATUS_META, isItemExchanged, type Item } from '@entities/item';

import { StatusTag } from '@shared/ui';

import './ProductCard.scss';

interface ProductCardProps {
  item: Item;
  onClick: () => void;
}

export function ProductCard({ item, onClick }: ProductCardProps) {
  const statusMeta = ITEM_STATUS_META[item.status];
  // обменянный товар уже отдан — карточка остаётся в списке как история сделок,
  // но открывать её нечего: бэкенд отклоняет любые мутации архивного товара
  const exchanged = isItemExchanged(item.status);
  const label = item.category
    ? `${item.title}, ${item.category}, ${statusMeta.label}`
    : `${item.title}, ${statusMeta.label}`;

  const interactiveProps = exchanged
    ? {}
    : {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        },
      };

  return (
    <article
      className={exchanged ? 'product-card product-card--exchanged' : 'product-card'}
      aria-label={label}
      {...interactiveProps}
    >
      <div className="product-card__photo">
        {item.imageUrl ? (
          <img className="product-card__image" src={item.imageUrl} alt={item.title} />
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
