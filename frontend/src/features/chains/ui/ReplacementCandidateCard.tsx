import type { ReplacementOption } from '@entities/chain';

import { replacementPillMeta } from '../model/replacementPill';

import './ReplacementCandidateCard.scss';

interface ReplacementCandidateCardProps {
  option: ReplacementOption;
  selected?: boolean;
  disabled?: boolean;
  // без onSelect карточка только для просмотра — без radio и рамки
  onSelect?: () => void;
}

// вся карточка — один label вокруг нативного radio: так тач-таргет больше минимума 44×44,
// а состояние читается скринридером из самого radio
export function ReplacementCandidateCard({
  option,
  selected = false,
  disabled = false,
  onSelect,
}: ReplacementCandidateCardProps) {
  const pill = replacementPillMeta(option.respondedAt);
  const className = [
    'replacement-card',
    onSelect && selected ? 'replacement-card--selected' : '',
    onSelect ? '' : 'replacement-card--invited',
  ]
    .filter(Boolean)
    .join(' ');

  const photo = (
    <span className="replacement-card__photo">
      {option.imageUrl ? (
        // description на карточке не показывается, но остаётся доступным как подсказка фото
        <img
          className="replacement-card__image"
          src={option.imageUrl}
          alt={option.title}
          title={option.description}
        />
      ) : (
        <span className="replacement-card__photo-placeholder" aria-hidden />
      )}
    </span>
  );

  const info = (
    <span className="replacement-card__info">
      <span className="replacement-card__title">{option.title}</span>
      <span className={`replacement-card__pill replacement-card__pill--${pill.tone}`}>
        {pill.text}
      </span>
    </span>
  );

  if (!onSelect) {
    return (
      <div className={className}>
        {photo}
        {info}
      </div>
    );
  }

  return (
    <label className={className}>
      {photo}
      {info}
      <input
        className="replacement-card__radio"
        type="radio"
        name="replacement"
        checked={selected}
        aria-checked={selected}
        disabled={disabled}
        onChange={onSelect}
      />
    </label>
  );
}
