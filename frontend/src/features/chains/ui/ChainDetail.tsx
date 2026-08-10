import { useState } from 'react';

import { Button } from 'antd';

import {
  chainLinks,
  myParticipant,
  participantAlias,
  VOTE_META,
  type Chain,
  type ChainLink,
  type ChainParticipant,
} from '@entities/chain';

import { Avatar } from '@shared/ui';

import { BestChainBadge } from './BestChainBadge';

import './ChainDetail.scss';

interface ChainDetailProps {
  chain: Chain;
  isBest: boolean;
  isVoting: boolean;
  onVote: (candidate: ChainParticipant, active: boolean) => void;
}

// Схема цепочки (макет 4.8): строки по звеньям кольца. Внутри звена один кандидат показывается
// карточкой товара, несколько — свёрнутым списком «N вариантов» (§3.1); отклик доступен только
// на кандидатах позиции receivesFromPosition — за них голосует текущий пользователь, и только
// пока цепочка ещё CANDIDATE (у собранной отклики уже не меняются, PROJECT.md §4.5).
// Действие вынесено в отдельный блок под списком (SCRUM-52): кандидат выбирается кликом по
// строке, кнопка внизу применяется к выбранному — в строках участников кнопок нет.
export function ChainDetail({ chain, isBest, isVoting, onVote }: ChainDetailProps) {
  const links = chainLinks(chain);
  const me = myParticipant(chain);
  const canVote = chain.status === 'CANDIDATE';
  const receiveLink = links.find((link) => link.position === chain.receivesFromPosition);
  const receiveCandidates = receiveLink?.candidates ?? [];

  // выделение по умолчанию — кандидат с откликом, иначе первый без отклика; явный выбор
  // пользователя (override) переживает refetch после отклика/отзыва и остаётся в силе
  const [overrideRequestId, setOverrideRequestId] = useState<number | null>(null);
  const preferredRequestId =
    receiveCandidates.find((candidate) => candidate.vote === 'pending')?.requestId ??
    receiveCandidates.find((candidate) => !candidate.vote)?.requestId ??
    receiveCandidates[0]?.requestId ??
    null;
  const selectedRequestId =
    overrideRequestId !== null &&
    receiveCandidates.some((candidate) => candidate.requestId === overrideRequestId)
      ? overrideRequestId
      : preferredRequestId;

  const selectedCandidate = receiveCandidates.find(
    (candidate) => candidate.requestId === selectedRequestId,
  );
  const active = selectedCandidate ? !selectedCandidate.vote : false;
  // действие доступно только на кандидатной цепочке и только для отклика либо pending-отклика —
  // у принятого/отклонённого отклика кнопки нет (DELETE их не снимает, PROJECT.md §4.5)
  const showActions = Boolean(
    selectedCandidate && canVote && (active || selectedCandidate.vote === 'pending'),
  );

  return (
    <>
      {isBest ? (
        // обёртка обязательна: прямые дети .chain-detail-page__body растягиваются на всю
        // ширину колонки, а плашка должна остаться по ширине текста
        <div className="chain-detail__best">
          <BestChainBadge />
        </div>
      ) : null}
      <ul className="chain-detail__participants">
        {links.map((link) => (
          <ChainLinkRow
            key={link.position}
            link={link}
            isMine={me?.position === link.position}
            isReceiveLink={link.position === chain.receivesFromPosition}
            selectedRequestId={selectedRequestId}
            onSelectCandidate={setOverrideRequestId}
          />
        ))}
      </ul>
      {showActions && selectedCandidate ? (
        <div className="chain-detail__actions">
          <Button
            className="chain-detail__action"
            type="primary"
            size="large"
            block
            danger={!active}
            loading={isVoting}
            onClick={() => onVote(selectedCandidate, active)}
          >
            {active ? 'Откликнуться' : 'Отозвать отклик'}
          </Button>
        </div>
      ) : null}
    </>
  );
}

interface ChainLinkRowProps {
  link: ChainLink;
  isMine: boolean;
  isReceiveLink: boolean;
  selectedRequestId: number | null;
  onSelectCandidate: (requestId: number) => void;
}

function ChainLinkRow({
  link,
  isMine,
  isReceiveLink,
  selectedRequestId,
  onSelectCandidate,
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
          selected={isReceiveLink && candidates[0].requestId === selectedRequestId}
          onSelect={isReceiveLink ? () => onSelectCandidate(candidates[0].requestId) : undefined}
        />
      ) : isReceiveLink ? (
        // на получаемом звене каждый кандидат откликается отдельно — здесь пул показан полностью
        <ul className="chain-detail__candidates">
          {candidates.map((candidate) => (
            <li key={candidate.requestId} className="chain-detail__candidate">
              <ChainLinkItem
                participant={candidate}
                selected={candidate.requestId === selectedRequestId}
                onSelect={() => onSelectCandidate(candidate.requestId)}
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
  selected: boolean;
  onSelect?: () => void;
}

// Одна запись кандидата в звене: миниатюра, товар и «что хочет взамен», статус отклика.
// На получаемом звене запись выбираемая (radio-строка) — действие применяется к выбранной
// из нижнего блока; на остальных звеньях запись только для просмотра.
function ChainLinkItem({ participant, selected, onSelect }: ChainLinkItemProps) {
  const voteMeta = participant.vote ? VOTE_META[participant.vote] : null;
  const className = `chain-detail__item${selected ? ' chain-detail__item--selected' : ''}${
    onSelect ? ' chain-detail__item--selectable' : ''
  }`;

  return (
    <div
      className={className}
      role={onSelect ? 'radio' : undefined}
      aria-checked={onSelect ? selected : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
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
