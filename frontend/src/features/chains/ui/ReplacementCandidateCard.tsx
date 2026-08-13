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

  const content = (
    <>
      <div className="replacement-card__photo">
        {option.imageUrl ? (
          <img className="replacement-card__image" src={option.imageUrl} alt={option.title} />
        ) : (
          <span className="replacement-card__photo-placeholder" aria-hidden>
            {option.title[0] ?? ''}
          </span>
        )}
      </div>
      <div className="replacement-card__body">
        <p className="replacement-card__title">{option.title}</p>
        {option.description ? (
          <p className="replacement-card__description">{option.description}</p>
        ) : null}
        <p className="replacement-card__wanted">Хочет: {option.wantedDescription}</p>
        <div className="replacement-card__meta">
          <span className={`replacement-card__pill replacement-card__pill--${pill.tone}`}>
            {pill.text}
          </span>
          {onSelect ? (
            <input
              className="replacement-card__radio"
              type="radio"
              name="replacement"
              checked={selected}
              aria-checked={selected}
              disabled={disabled}
              onChange={onSelect}
            />
          ) : null}
        </div>
      </div>
    </>
  );

  if (!onSelect) {
    return <div className={className}>{content}</div>;
  }

  return <label className={className}>{content}</label>;
}
