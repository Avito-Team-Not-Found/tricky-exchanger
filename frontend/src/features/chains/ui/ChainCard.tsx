import { theme, Button } from 'antd';

import {
  HARD_LOCK_MESSAGE,
  isHardLocked,
  type ExchangeOption,
  type ExchangeOptions,
  type VoteValue,
} from '@entities/chain';

import { ProbabilityBadge } from '@shared/ui';

import { ConsentBadge } from './ConsentBadge';

import './ChainCard.scss';

interface ChainCardProps {
  options: ExchangeOptions;
  option: ExchangeOption;
  isVoting: boolean;
  isConfirming: boolean;
  locked?: boolean;
  // число согласий второго раунда: на FROZEN всегда = length, на PROPOSED — из деталей цепочки
  // (exchange-options его не отдаёт); undefined — бейдж не рисуем, пока счётчик неизвестен
  approvedCount?: number;
  onOpen: () => void;
  onVote: (active: boolean) => void;
  onConfirm: (chainId: number) => void;
  onConfirmNow: (chainId: number) => void;
  onDecline: (chainId: number) => void;
}

// Карточка варианта обмена (макет 4.6): один конкретный получаемый товар из пула кандидатов
// следующего звена. На кандидатной цепочке действие — «Откликнуться» / «Отозвать отклик» по
// option.vote; на PROPOSED — «Требуются действия» (подтверждение второго раунда), а после «Я
// подумаю» — inline-«Да»/«Нет» без модалки; на FROZEN/IN_PROGRESS — «Перейти к сделке», плашка
// жёсткой блокировки и бейдж «N/M согласий» (SOFT-LOCK §5.1–5.5). Мой голос второго раунда
// на этом экране — vote единственного receiveOption (SOFT-LOCK §3.3).
export function ChainCard({
  options,
  option,
  isVoting,
  isConfirming,
  locked,
  approvedCount,
  onOpen,
  onVote,
  onConfirm,
  onConfirmNow,
  onDecline,
}: ChainCardProps) {
  const { token } = theme.useToken();
  const canVote = options.status === 'CANDIDATE';
  const canAct = canVote && (!option.vote || option.vote === 'pending');
  const hardLocked = isHardLocked(options.status);
  // на PROPOSED receiveOption ровно один, и его vote — решение текущего пользователя (§3.3);
  // на CANDIDATE то же поле — отклик первого раунда, myVote им не считается
  const myVote: VoteValue | undefined = options.status === 'PROPOSED' ? option.vote : undefined;
  const thinking = myVote === 'thinking';
  const confirmed = myVote === 'approved';
  const needsAction = options.status === 'PROPOSED' && !thinking && !confirmed;

  const className = [
    'chain-card',
    needsAction || thinking || hardLocked ? 'chain-card--highlight' : '',
    locked ? 'chain-card--dimmed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className} onClick={onOpen} aria-disabled={locked || undefined}>
      {approvedCount !== undefined ? (
        <ConsentBadge
          className="chain-card__consent"
          count={approvedCount}
          total={options.length}
        />
      ) : null}

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
              type="primary"
              danger
              block
              size="large"
              loading={isVoting}
              disabled={locked}
              onClick={() => onVote(false)}
            >
              Отозвать отклик
            </Button>
          ) : (
            <Button
              type="primary"
              block
              size="large"
              loading={isVoting}
              disabled={locked}
              onClick={() => onVote(true)}
            >
              Откликнуться
            </Button>
          )}
        </div>
      ) : thinking ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          <p className="chain-card__hurry" role="status">
            ⚠ Примите решение как можно скорее!
          </p>
          <div className="chain-card__inline">
            <Button
              type="primary"
              block
              size="large"
              loading={isConfirming}
              disabled={locked}
              onClick={() => onConfirmNow(options.chainId)}
            >
              Да
            </Button>
            <Button
              block
              size="large"
              disabled={isConfirming || locked}
              onClick={() => onDecline(options.chainId)}
            >
              Нет
            </Button>
          </div>
        </div>
      ) : confirmed ? (
        <p className="chain-card__confirmed" role="status">
          Вы подтвердили · ждём остальных
        </p>
      ) : needsAction ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          <Button
            type="primary"
            block
            size="large"
            disabled={locked}
            onClick={() => onConfirm(options.chainId)}
          >
            Требуются действия
          </Button>
        </div>
      ) : hardLocked ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          <Button
            block
            size="large"
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
