import { theme, Button } from 'antd';

import {
  HARD_LOCK_MESSAGE,
  isHardLocked,
  type ExchangeOption,
  type ExchangeOptions,
} from '@entities/chain';

import { ProbabilityBadge } from '@shared/ui';

import './ChainCard.scss';

interface ChainCardProps {
  options: ExchangeOptions;
  option: ExchangeOption;
  isVoting: boolean;
  locked?: boolean;
  onOpen: () => void;
  onVote: (active: boolean) => void;
  onConfirm: (chainId: number) => void;
}

// Карточка варианта обмена (макет 4.6): один конкретный получаемый товар из пула кандидатов
// следующего звена. На кандидатной цепочке действие — «Откликнуться» / «Отозвать отклик» по
// option.vote; на PROPOSED — «Требуются действия» (подтверждение второго раунда), на
// FROZEN/IN_PROGRESS — «Перейти к сделке» и плашка жёсткой блокировки (SOFT-LOCK §5.1–5.5).
export function ChainCard({
  options,
  option,
  isVoting,
  locked,
  onOpen,
  onVote,
  onConfirm,
}: ChainCardProps) {
  const { token } = theme.useToken();
  const canVote = options.status === 'CANDIDATE';
  const canAct = canVote && (!option.vote || option.vote === 'pending');
  const needsAction = options.status === 'PROPOSED';
  const hardLocked = isHardLocked(options.status);

  const className = [
    'chain-card',
    needsAction || hardLocked ? 'chain-card--highlight' : '',
    locked ? 'chain-card--dimmed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className} onClick={onOpen} aria-disabled={locked || undefined}>
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

      {hardLocked ? <p className="chain-card__lock">{HARD_LOCK_MESSAGE}</p> : null}

      {canAct ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          {option.vote === 'pending' ? (
            <Button
              className="chain-card__action"
              type="primary"
              danger
              block
              loading={isVoting}
              disabled={locked}
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
              disabled={locked}
              onClick={() => onVote(true)}
            >
              Откликнуться
            </Button>
          )}
        </div>
      ) : needsAction ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          <Button
            className="chain-card__action"
            type="primary"
            block
            disabled={locked}
            onClick={() => onConfirm(options.chainId)}
          >
            Требуются действия
          </Button>
        </div>
      ) : hardLocked ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          <Button
            className="chain-card__action"
            block
            style={{
              backgroundColor: token.colorSuccess,
              borderColor: token.colorSuccess,
              color: '#FFFFFF',
            }}
            onClick={onOpen}
          >
            Перейти к сделке
          </Button>
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
