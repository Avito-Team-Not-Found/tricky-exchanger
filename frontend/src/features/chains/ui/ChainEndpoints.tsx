import { ArrowRightOutlined } from '@ant-design/icons';

import { participantAlias, type Chain, type ChainParticipant } from '@entities/chain';

import { Avatar } from '@shared/ui';

import './ChainCard.scss';

// Мини-визуализация цепочки (DESIGN.md §2.7): круглые бейджики участников (md), средние звенья
// свёрнуты в круглый чип «+N чел.», последний участник — в конце ряда. Текущий пользователь —
// аватар с подписью «Я» и рамкой accent-primary (макет 4.6).
export function ChainEndpoints({ chain }: { chain: Chain }) {
  const { participants } = chain;
  const first = participants[0];
  const last = participants[participants.length - 1];
  const collapsedCount = participants.length - 2;

  return (
    <div className="chain-card__endpoints">
      <EndpointsAvatar participant={first} />
      <ArrowRightOutlined className="chain-card__arrow" aria-hidden />
      {collapsedCount > 0 ? (
        <>
          <span className="chain-card__collapsed">{`+${collapsedCount} чел.`}</span>
          <ArrowRightOutlined className="chain-card__arrow" aria-hidden />
        </>
      ) : null}
      {last && last !== first ? <EndpointsAvatar participant={last} /> : null}
    </div>
  );
}

function EndpointsAvatar({ participant }: { participant: ChainParticipant | undefined }) {
  if (!participant) return null;
  const alias = participantAlias(participant.position);
  return (
    <span
      className={`chain-card__endpoint${
        participant.isCurrentUser ? ' chain-card__endpoint--me' : ''
      }`}
    >
      <Avatar
        name={participant.isCurrentUser ? 'Вы' : alias.name}
        size="md"
        label={participant.isCurrentUser ? 'Я' : undefined}
        emoji={participant.isCurrentUser ? undefined : alias.emoji}
      />
    </span>
  );
}
