import { theme, Button } from 'antd';

import { HARD_LOCK_MESSAGE, isHardLocked, receivesItem, type Chain } from '@entities/chain';

import { ProbabilityBadge } from '@shared/ui';

import './ChainItemView.scss';

interface ChainItemViewProps {
  chain: Chain;
  onOpenParticipants: () => void;
  onConfirm: () => void;
  onProceed: () => void;
}

// Экран цепочки (макет 4.7): товар, который пользователь получит в обмене, его описание
// и переход к схеме участников (макет 4.8). Пока цепочка CANDIDATE, получаемое звено — пул
// кандидатов: товар однозначен только когда кандидат один (собранная цепочка, §3.1).
// На PROPOSED внизу — «Требуются действия», на FROZEN/IN_PROGRESS — плашка блокировки
// и «Перейти к сделке» (SOFT-LOCK §7).
export function ChainItemView({
  chain,
  onOpenParticipants,
  onConfirm,
  onProceed,
}: ChainItemViewProps) {
  const { token } = theme.useToken();
  const received = receivesItem(chain);
  const single = received.length === 1 ? received[0] : null;
  const isAssembled = chain.status !== 'CANDIDATE';
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
        <h2 className="chain-item__title">
          {single?.offeredItemTitle ??
            `Получаете: ${received.length} ${pluralizeVariants(received.length)}`}
        </h2>
        <div className="chain-item__meta">
          <span className="chain-item__count">
            {chain.length} {pluralize(chain.length)} в цепочке
          </span>
          {isAssembled ? (
            <span className="chain-item__ready">Цепочка собрана</span>
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
        {chain.status === 'PROPOSED' ? (
          <Button
            className="chain-item__action"
            type="primary"
            size="large"
            block
            onClick={onConfirm}
          >
            Требуются действия
          </Button>
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
