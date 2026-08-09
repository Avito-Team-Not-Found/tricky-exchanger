import type { ReplacementOption } from '@entities/chain';

import { replacementPillMeta } from '../model/replacementPill';

import './ReplacementCandidateCard.scss';

interface ReplacementCandidateCardProps {
  option: ReplacementOption;
  selected?: boolean;
  disabled?: boolean;
  // без onSelect — карточка для просмотра приглашённого кандидата (TZ §5.4): без radio и рамки
  onSelect?: () => void;
}

// Карточка кандидата на замену (TZ §5.2): фото, название и метка актуальности. В выбираемом виде
// вся карточка — один label вокруг нативного radio, чтобы тач-таргет был больше минимума 44×44;
// состояние читается скринридером из самого radio, рамка выбранной карточки — дублирующая индикация.
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
        // description не показывается на карточке, но остаётся доступным как подсказка фото (TZ §5.2)
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
