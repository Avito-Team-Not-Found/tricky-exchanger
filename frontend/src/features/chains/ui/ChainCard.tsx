import { theme, Button } from 'antd';

import {
  hasDeal,
  isHardLocked,
  needsShipment,
  type ExchangeOption,
  type ExchangeOptions,
  type VoteValue,
} from '@entities/chain';

import { plural } from '@shared/lib/plural';
import { FadeInImage, ProbabilityBadge } from '@shared/ui';

import type { DeadlinePurpose } from '../model/useDeadlineLabel';

import { ConsentBadge } from './ConsentBadge';
import { DeadlineRow } from './DeadlineRow';

import './ChainCard.scss';

interface ChainCardProps {
  options: ExchangeOptions;
  option: ExchangeOption;
  isVoting: boolean;
  locked?: boolean;
  // exchange-options счётчик не отдаёт: undefined — бейдж не рисуем, пока он неизвестен
  approvedCount?: number;
  // exchange-options дедлайн не отдаёт — без даты таймер не рисуем
  deadlineAt?: string | null;
  // быстрая замена после отказа на FROZEN — тоже PROPOSED, но с дедлайном подбора замены
  deadlinePurpose?: DeadlinePurpose;
  // непустой пул замен — вакансия в цепочке: кнопка ведёт на выбор замены вместо подтверждения
  needsReplacement?: boolean;
  onOpen: () => void;
  onProceed: () => void;
  onVote: (active: boolean) => void;
  onConfirm: (chainId: number) => void;
  onReplace: () => void;
}

export function ChainCard({
  options,
  option,
  isVoting,
  locked,
  approvedCount,
  deadlineAt,
  deadlinePurpose,
  needsReplacement,
  onOpen,
  onProceed,
  onVote,
  onConfirm,
  onReplace,
}: ChainCardProps) {
  const { token } = theme.useToken();
  const canVote = options.status === 'CANDIDATE';
  const canAct = canVote && (!option.vote || option.vote === 'pending');
  const hardLocked = isHardLocked(options.status);
  // собранная, но ещё не начатая цепочка: вероятность обмена всё ещё важна — показываем score
  const showScore = options.status === 'PROPOSED' || options.status === 'FROZEN';
  // на FROZEN сделка началась, но товар не отправлен — зовём действовать, а не «к сделке»
  const shipRequired = needsShipment(options.status);
  const dealReady = hasDeal(options.status) && !shipRequired;
  // на PROPOSED receiveOption ровно один, и его vote — решение текущего пользователя;
  // на CANDIDATE то же поле — отклик первого раунда, myVote им не считается
  const myVote: VoteValue | undefined = options.status === 'PROPOSED' ? option.vote : undefined;
  const confirmed = myVote === 'approved';
  const needsAction = options.status === 'PROPOSED' && !confirmed;

  const className = [
    'chain-card',
    needsReplacement || needsAction || hardLocked ? 'chain-card--highlight' : '',
    locked ? 'chain-card--dimmed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={className}
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-label={`${option.title}: ${option.wantedDescription}`}
      aria-disabled={locked || undefined}
      onClick={locked ? undefined : onOpen}
      onKeyDown={(event) => {
        if (locked) return;
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {approvedCount !== undefined ? (
        <ConsentBadge
          key={approvedCount}
          className="chain-card__consent"
          count={approvedCount}
          total={options.length}
        />
      ) : null}

      <div className="chain-card__photo">
        {option.imageUrl ? (
          <FadeInImage className="chain-card__photo-img" src={option.imageUrl} alt={option.title} />
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
          {options.length} {plural(options.length, ['участник', 'участника', 'участников'])}
        </span>
        {canVote || showScore ? <ProbabilityBadge score={options.score} /> : null}
      </div>

      <DeadlineRow
        status={options.status}
        deadlineAt={deadlineAt}
        showShipDeadline
        purpose={deadlinePurpose}
      />

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
      ) : needsReplacement ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          <Button type="primary" block size="large" disabled={locked} onClick={onReplace}>
            Требуется действие
          </Button>
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
      ) : shipRequired ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          <Button type="primary" block size="large" disabled={locked} onClick={onProceed}>
            Требуется действие
          </Button>
        </div>
      ) : dealReady ? (
        <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
          <Button
            block
            size="large"
            style={{
              backgroundColor: token.colorSuccess,
              borderColor: token.colorSuccess,
              color: '#FFFFFF',
            }}
            onClick={onProceed}
          >
            Перейти к сделке
          </Button>
        </div>
      ) : null}
    </article>
  );
}
