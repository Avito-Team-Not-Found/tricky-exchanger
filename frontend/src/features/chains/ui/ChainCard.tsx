import { Button } from 'antd';

import { type ExchangeOption, type ExchangeOptions } from '@entities/chain';

import { ProbabilityBadge } from '@shared/ui';

import './ChainCard.scss';

interface ChainCardProps {
  options: ExchangeOptions;
  option: ExchangeOption;
  isVoting: boolean;
  onOpen: () => void;
  onVote: (active: boolean) => void;
}

// Карточка варианта обмена (макет 4.6): один конкретный получаемый товар из пула кандидатов
// следующего звена. Действие — «Откликнуться» / «Отозвать отклик» по option.vote; отозвать можно
// только pending-отклик (DELETE их снимает лишь у кандидатной цепочки, PROJECT.md §4.5), у
// собранной цепочки действие скрыто, место бейджа занимает пилюля «Цепочка собрана».
export function ChainCard({ options, option, isVoting, onOpen, onVote }: ChainCardProps) {
  const canVote = options.status === 'CANDIDATE';
  const canAct = canVote && (!option.vote || option.vote === 'pending');

  return (
    <article className="chain-card" onClick={onOpen}>
      <div className="chain-card__photo">
        {option.imageUrl ? (
          <img className="chain-card__photo-img" src={option.imageUrl} alt={option.title} />
        ) : (
          <div className="chain-card__photo-placeholder" aria-hidden>
            {option.title[0] ?? ''}
          </div>
        )}
      </div>

      <p className="chain-card__title">{option.title}</p>
      <p className="chain-card__wanted">Хочет: {option.wantedDescription}</p>

      <div className="chain-card__meta">
        <span className="chain-card__count">
          {options.length} {pluralize(options.length)}
        </span>
        {canVote ? (
          <ProbabilityBadge score={options.score} />
        ) : (
          <span className="chain-card__ready">Цепочка собрана</span>
        )}
      </div>

      {canAct ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          {option.vote === 'pending' ? (
            <Button
              className="chain-card__action"
              type="primary"
              danger
              block
              loading={isVoting}
              onClick={() => onVote(false)}
            >
              Отозвать отклик
            </Button>
          ) : (
            <Button
              className="chain-card__action"
              type="primary"
              block
              loading={isVoting}
              onClick={() => onVote(true)}
            >
              Откликнуться
            </Button>
          )}
        </div>
      ) : null}
    </article>
  );
}

function pluralize(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'участник';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'участника';
  return 'участников';
}
