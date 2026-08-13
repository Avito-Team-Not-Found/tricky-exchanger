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
import { FadeInImage, ProbabilityBadge } from '@shared/ui';

import { chainDeadlinePurpose } from '../model/useDeadlineLabel';

import { ConsentBadge } from './ConsentBadge';
import { DeadlineRow } from './DeadlineRow';

import './ChainItemView.scss';

interface ChainItemViewProps {
  chain: Chain;
  // заявка выбранного варианта получения: экран показывает именно её товар
  receiveRequestId?: number;
  isVoting: boolean;
  // непустой пул замен — вакансия в цепочке: плашка и кнопка ведут на выбор замены
  needsReplacement?: boolean;
  onVote: (candidate: ChainParticipant, active: boolean) => void;
  onOpenParticipants: () => void;
  onConfirm: () => void;
  onProceed: () => void;
  onReplace: () => void;
}

export function ChainItemView({
  chain,
  receiveRequestId,
  isVoting,
  needsReplacement,
  onVote,
  onOpenParticipants,
  onConfirm,
  onProceed,
  onReplace,
}: ChainItemViewProps) {
  const { token } = theme.useToken();
  const received = receivesItem(chain, receiveRequestId);
  const single = received.length === 1 ? received[0] : null;
  const assembled = isAssembled(chain.status);
  const hardLocked = isHardLocked(chain.status);
  const shipRequired = needsShipment(chain.status);
  // approved/rejected отклик снять нельзя (DELETE их не снимает) — кнопки для них нет
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
          <FadeInImage
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
              <ConsentBadge
                key={approvedVotes(chain)}
                count={approvedVotes(chain)}
                total={chain.length}
              />
            </span>
          ) : (
            <ProbabilityBadge score={chain.score} />
          )}
        </div>
      </div>

      {needsReplacement ? (
        <p className="chain-item__replacement" role="status">
          Участник отказался. Выберите замену, чтобы продолжить обмен
        </p>
      ) : hardLocked ? (
        <p className="chain-item__lock">{HARD_LOCK_MESSAGE}</p>
      ) : null}

      <DeadlineRow
        status={chain.status}
        deadlineAt={chain.freezeDeadlineAt}
        purpose={chainDeadlinePurpose(chain)}
      />

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
        ) : needsReplacement ? (
          <Button
            className="chain-item__action"
            type="primary"
            size="large"
            block
            onClick={onReplace}
          >
            Требуется действие
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
