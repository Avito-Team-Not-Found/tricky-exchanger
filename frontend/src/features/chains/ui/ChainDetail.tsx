import { Button } from 'antd';

import {
  chainLinks,
  myParticipant,
  participantAlias,
  VOTE_META,
  type Chain,
  type ChainParticipant,
  type ChainLink,
} from '@entities/chain';

import { Avatar } from '@shared/ui';

import './ChainDetail.scss';

interface ChainDetailProps {
  chain: Chain;
  isVoting: boolean;
  onVote: (candidate: ChainParticipant, active: boolean) => void;
}

// Схема цепочки (макет 4.8): строки по звеньям кольца. Внутри звена один кандидат показывается
// карточкой товара, несколько — свёрнутым списком «N вариантов» (§3.1); отклик доступен только
// на кандидатах позиции receivesFromPosition — за них голосует текущий пользователь, и только
// пока цепочка ещё CANDIDATE (у собранной отклики уже не меняются, PROJECT.md §4.5).
export function ChainDetail({ chain, isVoting, onVote }: ChainDetailProps) {
  const links = chainLinks(chain);
  const me = myParticipant(chain);
  const canVote = chain.status === 'CANDIDATE';

  return (
    <ul className="chain-detail__participants">
      {links.map((link) => (
        <ChainLinkRow
          key={link.position}
          link={link}
          isMine={me?.position === link.position}
          isReceiveLink={link.position === chain.receivesFromPosition}
          canVote={canVote}
          isVoting={isVoting}
          onVote={onVote}
        />
      ))}
    </ul>
  );
}

interface ChainLinkRowProps {
  link: ChainLink;
  isMine: boolean;
  isReceiveLink: boolean;
  canVote: boolean;
  isVoting: boolean;
  onVote: (candidate: ChainParticipant, active: boolean) => void;
}

function ChainLinkRow({
  link,
  isMine,
  isReceiveLink,
  canVote,
  isVoting,
  onVote,
}: ChainLinkRowProps) {
  const alias = participantAlias(link.position);
  const label = isMine ? 'Вы' : alias.name;
  const { candidates } = link;

  return (
    <li className={`chain-detail__participant${isMine ? ' chain-detail__participant--me' : ''}`}>
      <div className="chain-detail__participant-head">
        <Avatar
          name={label}
          size="md"
          label={isMine ? 'Я' : undefined}
          emoji={isMine ? undefined : alias.emoji}
        />
        <span className="chain-detail__participant-name">{label}</span>
      </div>

      {candidates.length === 1 ? (
        <ChainLinkItem
          participant={candidates[0]}
          isReceiveLink={isReceiveLink}
          canVote={canVote}
          isVoting={isVoting}
          onVote={onVote}
        />
      ) : isReceiveLink ? (
        // на получаемом звене каждый кандидат откликаем отдельно — здесь пул показан полностью
        <ul className="chain-detail__candidates">
          {candidates.map((candidate) => (
            <li key={candidate.requestId} className="chain-detail__candidate">
              <ChainLinkItem
                participant={candidate}
                isReceiveLink
                canVote={canVote}
                isVoting={isVoting}
                onVote={onVote}
              />
            </li>
          ))}
        </ul>
      ) : (
        // кандидаты остальных звеньев для отклика не нужны — сворачиваем их в счётчик
        <span className="chain-detail__collapsed">
          {candidates.length} {pluralize(candidates.length)}
        </span>
      )}
    </li>
  );
}

interface ChainLinkItemProps {
  participant: ChainParticipant;
  isReceiveLink: boolean;
  canVote: boolean;
  isVoting: boolean;
  onVote: (candidate: ChainParticipant, active: boolean) => void;
}

// Одна запись кандидата в звене: миниатюра, товар и «что хочет взамен», статус отклика и действие.
// Действие видно только на кандидатной цепочке; отозвать можно лишь pending-отклик —
// у принятого/отклонённого отклика кнопки нет (DELETE их не снимает, PROJECT.md §4.5).
function ChainLinkItem({
  participant,
  isReceiveLink,
  canVote,
  isVoting,
  onVote,
}: ChainLinkItemProps) {
  const voteMeta = participant.vote ? VOTE_META[participant.vote] : null;
  const active = !participant.vote;
  const showAction = isReceiveLink && canVote && (active || participant.vote === 'pending');

  return (
    <div className="chain-detail__item">
      <span
        className={`chain-detail__thumb${participant.imageUrl ? '' : ' chain-detail__thumb--empty'}`}
        aria-hidden
      >
        {participant.imageUrl ? (
          <img className="chain-detail__thumb-img" src={participant.imageUrl} alt="" />
        ) : null}
      </span>
      <div className="chain-detail__item-info">
        <span className="chain-detail__item-title">{participant.offeredItemTitle}</span>
        <span className="chain-detail__item-wanted">Хочет: {participant.wantedDescription}</span>
      </div>
      {voteMeta ? (
        <span className={`chain-detail__response chain-detail__response--${voteMeta.tone}`}>
          {voteMeta.glyph} {voteMeta.label}
        </span>
      ) : null}
      {showAction ? (
        <Button
          className="chain-detail__item-action"
          size="small"
          danger={!active}
          loading={isVoting}
          onClick={() => onVote(participant, active)}
        >
          {active ? 'Откликнуться' : 'Отозвать отклик'}
        </Button>
      ) : null}
    </div>
  );
}

function pluralize(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вариант';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'варианта';
  return 'вариантов';
}
