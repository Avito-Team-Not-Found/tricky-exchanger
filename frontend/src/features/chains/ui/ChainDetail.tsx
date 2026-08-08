import { ArrowRightOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import {
  chainReadiness,
  myParticipant,
  participantAlias,
  receivesItem,
  RESPONSE_STATUS_META,
  type Chain,
  type ChainItemRef,
} from '@entities/chain';

import { Avatar } from '@shared/ui';

import './ChainDetail.scss';

interface ChainDetailProps {
  chain: Chain;
  onRespond: (kind: 'accept' | 'decline') => void;
  onSelect: () => void;
  onDeselect: () => void;
  isResponding: boolean;
  isSelecting: boolean;
}

// Схема участников цепочки (DESIGN.md §2.8, макет 4.8): строки участников с тем, что они отдают/получают,
// и статусом отклика. Действия — по viewerPermissions, источник правды — сам бэкенд.
export function ChainDetail({
  chain,
  onRespond,
  onSelect,
  onDeselect,
  isResponding,
  isSelecting,
}: ChainDetailProps) {
  const me = myParticipant(chain);
  const { agreed, total } = chainReadiness(chain);
  const isReady = agreed === total && total > 0;
  const { canRespond, canSelect, canDeselect } = chain.viewerPermissions;

  return (
    <div className="chain-detail">
      {isReady ? (
        <span className="chain-detail__ready">Цепочка собрана</span>
      ) : (
        <span className="chain-detail__progress">
          {agreed}/{total} согласий
        </span>
      )}

      <ul className="chain-detail__participants">
        {chain.participants.map((participant) => {
          const received = receivesItem(participant, chain);
          const statusMeta = participant.responseStatus
            ? RESPONSE_STATUS_META[participant.responseStatus]
            : null;
          const alias = participantAlias(participant.position);
          const displayName = participant.isCurrentUser ? 'Вы' : alias.name;
          return (
            <li
              key={participant.position}
              className={`chain-detail__participant${
                participant.isCurrentUser ? ' chain-detail__participant--me' : ''
              }`}
            >
              <div className="chain-detail__participant-head">
                <Avatar
                  name={displayName}
                  size="md"
                  label={participant.isCurrentUser ? 'Я' : undefined}
                  emoji={participant.isCurrentUser ? undefined : alias.emoji}
                />
                <span className="chain-detail__participant-name">{displayName}</span>
                {statusMeta ? (
                  <span
                    className={`chain-detail__response chain-detail__response--${statusMeta.tone}`}
                  >
                    {statusMeta.glyph} {statusMeta.label}
                  </span>
                ) : (
                  <span className="chain-detail__response chain-detail__response--warning">
                    ⏳ Ожидает ответа
                  </span>
                )}
              </div>
              <div className="chain-detail__swap">
                <ChainSwapSide item={participant.offeredItem} />
                <ArrowRightOutlined className="chain-detail__arrow" aria-hidden />
                <ChainSwapSide item={received} />
              </div>
            </li>
          );
        })}
      </ul>

      {canRespond ? (
        <div className="chain-detail__actions">
          <Button
            type="primary"
            size="large"
            loading={isResponding}
            disabled={isSelecting}
            onClick={() => onRespond('accept')}
          >
            Принять участие
          </Button>
          <Button
            danger
            size="large"
            loading={isResponding}
            disabled={isSelecting}
            onClick={() => onRespond('decline')}
          >
            Отказаться
          </Button>
        </div>
      ) : canDeselect ? (
        <div className="chain-detail__actions">
          <Button
            type="primary"
            danger
            size="large"
            block
            loading={isSelecting}
            disabled={isResponding}
            onClick={onDeselect}
          >
            Отменить выбор
          </Button>
        </div>
      ) : canSelect ? (
        <div className="chain-detail__actions">
          <Button
            type="primary"
            size="large"
            block
            loading={isSelecting}
            disabled={isResponding}
            onClick={onSelect}
          >
            Выбрать цепочку
          </Button>
        </div>
      ) : me?.responseStatus === 'DECLINED' ? (
        <p className="chain-detail__declined" role="status">
          Вы отказались от этой цепочки
        </p>
      ) : null}
    </div>
  );
}

// Половина мини-визуализации обмена (макет 4.8): миниатюра 28×28 и название не должны
// разрываться переносом строки, поэтому это один нерасщепляемый блок
function ChainSwapSide({ item }: { item: ChainItemRef | null }) {
  return (
    <span className="chain-detail__swap-side">
      <span
        className={`chain-detail__thumb${item?.imageUrl ? '' : ' chain-detail__thumb--empty'}`}
        aria-hidden
      >
        {item?.imageUrl ? (
          <img className="chain-detail__thumb-img" src={item.imageUrl} alt="" />
        ) : null}
      </span>
      <span className="chain-detail__item">{item?.title ?? 'Товар удалён'}</span>
    </span>
  );
}
