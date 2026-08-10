import { theme, Button } from 'antd';

import {
  approvedVotes,
  HARD_LOCK_MESSAGE,
  isAssembled,
  isHardLocked,
  myConfirmVote,
  needsMyAction,
  receivesItem,
  type Chain,
} from '@entities/chain';

import { ProbabilityBadge } from '@shared/ui';

import { BestChainBadge } from './BestChainBadge';
import { ConsentBadge } from './ConsentBadge';

import './ChainItemView.scss';

interface ChainItemViewProps {
  chain: Chain;
  isBest: boolean;
  onOpenParticipants: () => void;
  onConfirm: () => void;
  onProceed: () => void;
}

// Экран цепочки (макет 4.7): товар, который пользователь получит в обмене, его описание
// и переход к схеме участников (макет 4.8). Пока цепочка CANDIDATE, получаемое звено — пул
// кандидатов: товар однозначен только когда кандидат один (собранная цепочка, §3.1).
// На PROPOSED внизу — «Требуются действия» (или «Вы подтвердили · ждём остальных», если голос
// уже поставлен), на FROZEN/IN_PROGRESS — плашка блокировки, бейдж «M/M согласий»
// и «Перейти к сделке» (SOFT-LOCK §7).
export function ChainItemView({
  chain,
  isBest,
  onOpenParticipants,
  onConfirm,
  onProceed,
}: ChainItemViewProps) {
  const { token } = theme.useToken();
  const received = receivesItem(chain);
  const single = received.length === 1 ? received[0] : null;
  const assembled = isAssembled(chain.status);
  const hardLocked = isHardLocked(chain.status);

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
        {isBest ? <BestChainBadge /> : null}
        <h2 className="chain-item__title">
          {single?.offeredItemTitle ??
            `Получаете: ${received.length} ${pluralizeVariants(received.length)}`}
        </h2>
        <div className="chain-item__meta">
          <span className="chain-item__count">
            {chain.length} {pluralize(chain.length)} в цепочке
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
        {needsMyAction(chain) ? (
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
        ) : hardLocked ? (
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

function pluralize(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'участник';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'участника';
  return 'участников';
}

function pluralizeVariants(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вариант';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'варианта';
  return 'вариантов';
}
