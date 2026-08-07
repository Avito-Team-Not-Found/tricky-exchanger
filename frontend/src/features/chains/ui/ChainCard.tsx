import { WarningOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import { chainReadiness, myParticipant, receivesItem, type Chain } from '@entities/chain';

import { ProbabilityBadge } from '@shared/ui';

import { ChainEndpoints } from './ChainEndpoints';

import './ChainCard.scss';

interface ChainCardProps {
  chain: Chain;
  onOpen: () => void;
  onSelect: () => void;
  onDeselect: () => void;
  isSelecting: boolean;
}

// Карточка варианта обмена (макет 4.6): у карточки ровно одна кнопка. Выбор не эксклюзивен —
// пользователь может отметить любое количество цепочек и снять отметку («Отменить выбор»).
// Отклик на карточке не даётся — только на детальном экране.
export function ChainCard({ chain, onOpen, onSelect, onDeselect, isSelecting }: ChainCardProps) {
  const me = myParticipant(chain);
  const received = me ? receivesItem(me, chain) : null;
  const { agreed, total } = chainReadiness(chain);
  const isReady = agreed === total && total > 0;
  const { canDeselect, canSelect } = chain.viewerPermissions;

  return (
    <article className="chain-card" onClick={onOpen}>
      <div className="chain-card__head">
        <ChainEndpoints chain={chain} />
        {/* прогресс откликов — синяя пилюля в шапке карточки (макет 4.6) */}
        <span className="chain-card__progress">
          {agreed}/{total} согласий
        </span>
      </div>

      <div className="chain-card__photo">
        {received?.image ? (
          <img className="chain-card__photo-img" src={received.image} alt={received.title} />
        ) : (
          <div className="chain-card__photo-placeholder" aria-hidden>
            {received?.title[0] ?? ''}
          </div>
        )}
      </div>

      <p className="chain-card__title">{received?.title ?? 'Товар удалён'}</p>

      <div className="chain-card__meta">
        <span className="chain-card__count">
          {total} {pluralize(total)}
        </span>
        {/* у собранной цепочки слот вероятности занимает зелёная пилюля «Цепочка собрана» */}
        {isReady ? (
          <span className="chain-card__ready">Цепочка собрана</span>
        ) : (
          <ProbabilityBadge score={chain.score} />
        )}
      </div>

      <div className="chain-card__actions" onClick={(event) => event.stopPropagation()}>
        {canDeselect ? (
          <Button
            className="chain-card__action"
            type="primary"
            danger
            block
            loading={isSelecting}
            onClick={onDeselect}
          >
            Отменить выбор
          </Button>
        ) : canSelect ? (
          <Button className="chain-card__action" block loading={isSelecting} onClick={onSelect}>
            Выбрать цепочку
          </Button>
        ) : me?.responseStatus === 'DECLINED' ? (
          <span className="chain-card__declined">
            <WarningOutlined aria-hidden />
            Вы отказались
          </span>
        ) : null}
      </div>
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
