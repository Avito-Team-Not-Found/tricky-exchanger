import { theme, Button } from 'antd';

import {
  approvedVotes,
  HARD_LOCK_MESSAGE,
  hasDeal,
  isAssembled,
  isHardLocked,
  myConfirmVote,
  needsMyAction,
  needsShipment,
  receivesItem,
  type Chain,
  type ChainParticipant,
} from '@entities/chain';

import { plural } from '@shared/lib/plural';
import { ProbabilityBadge } from '@shared/ui';

import { ConsentBadge } from './ConsentBadge';
import { DeadlineRow } from './DeadlineRow';

import './ChainItemView.scss';

interface ChainItemViewProps {
  chain: Chain;
  isVoting: boolean;
  onVote: (candidate: ChainParticipant, active: boolean) => void;
  onOpenParticipants: () => void;
  onConfirm: () => void;
  onProceed: () => void;
}

// Экран цепочки: товар, который пользователь получит в обмене, его описание,
// отклик на кандидата получаемого звена и переход к схеме участников;
// действие зависит от статуса цепочки
export function ChainItemView({
  chain,
  isVoting,
  onVote,
  onOpenParticipants,
  onConfirm,
  onProceed,
}: ChainItemViewProps) {
  const { token } = theme.useToken();
  const received = receivesItem(chain);
  const single = received.length === 1 ? received[0] : null;
  const assembled = isAssembled(chain.status);
  const hardLocked = isHardLocked(chain.status);
  const shipRequired = needsShipment(chain.status);
  // кандидат, на которого действует отклик: при pending-отклике кнопка становится
  // «Отозвать отклик», при отсутствии отклика — «Откликнуться» (как на карточке списка);
  // при approved/rejected отклика кнопки нет (DELETE их не снимает)
  const voteCandidate =
    received.find((candidate) => candidate.vote === 'pending') ??
    received.find((candidate) => !candidate.vote) ??
    null;
  const canVote = chain.status === 'CANDIDATE' && voteCandidate !== null;
  const withdraw = voteCandidate?.vote === 'pending';

  return (
    <div className="chain-item">
      <div className="chain-item__photo">
        {single?.imageUrl ? (
          <img
            className="chain-item__photo-img"
            src={single.imageUrl}
            alt={single.offeredItemTitle}
          />
        ) : (
          <div className="chain-item__photo-placeholder" aria-hidden />
        )}
      </div>

      <div className="chain-item__head">
        <h2 className="chain-item__title">
          {single?.offeredItemTitle ??
            `Получаете: ${received.length} ${plural(received.length, ['вариант', 'варианта', 'вариантов'])}`}
        </h2>
        <div className="chain-item__meta">
          <span className="chain-item__count">
            {chain.length} {plural(chain.length, ['участник', 'участника', 'участников'])} в цепочке
          </span>
          {assembled ? (
            <span className="chain-item__badges">
              <span className="chain-item__ready">Цепочка собрана</span>
              <ConsentBadge count={approvedVotes(chain)} total={chain.length} />
            </span>
          ) : (
            <ProbabilityBadge score={chain.score} />
          )}
        </div>
      </div>

      {hardLocked ? <p className="chain-item__lock">{HARD_LOCK_MESSAGE}</p> : null}

      <DeadlineRow status={chain.status} deadlineAt={chain.freezeDeadlineAt} />

      {single?.offeredItemDescription ? (
        <section className="chain-item__section">
          <h3 className="chain-item__section-title">Описание</h3>
          <p className="chain-item__description">{single.offeredItemDescription}</p>
        </section>
      ) : null}

      <div className="chain-item__actions">
        <Button className="chain-item__details" size="large" block onClick={onOpenParticipants}>
          Посмотреть всю цепочку
        </Button>
        {canVote && voteCandidate ? (
          <Button
            className="chain-item__action"
            type="primary"
            size="large"
            block
            danger={withdraw}
            loading={isVoting}
            onClick={() => onVote(voteCandidate, !withdraw)}
          >
            {withdraw ? 'Отозвать отклик' : 'Откликнуться'}
          </Button>
        ) : needsMyAction(chain) ? (
          <Button
            className="chain-item__action"
            type="primary"
            size="large"
            block
            onClick={onConfirm}
          >
            Требуются действия
          </Button>
        ) : chain.status === 'PROPOSED' && myConfirmVote(chain) === 'approved' ? (
          <p className="chain-item__confirmed" role="status">
            Вы подтвердили · ждём остальных
          </p>
        ) : shipRequired ? (
          <Button
            className="chain-item__action"
            type="primary"
            size="large"
            block
            onClick={onProceed}
          >
            Требуется действие
          </Button>
        ) : hasDeal(chain.status) ? (
          <Button
            className="chain-item__action"
            size="large"
            block
            style={{
              backgroundColor: token.colorSuccess,
              borderColor: token.colorSuccess,
              color: '#FFFFFF',
            }}
            onClick={onProceed}
          >
            Перейти к сделке
          </Button>
        ) : null}
      </div>
    </div>
  );
}
