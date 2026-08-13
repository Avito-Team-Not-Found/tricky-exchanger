import { theme, Button } from 'antd';

import {
  approvedVotes,
  chainLinks,
  CONFIRM_VOTE_META,
  confirmVoteAt,
  hasDeal,
  isAssembled,
  myConfirmVote,
  myParticipant,
  needsMyAction,
  participantAlias,
  VACANCY_META,
  VOTE_META,
  type Chain,
  type ChainLink,
  type ChainParticipant,
  type VoteValue,
} from '@entities/chain';

import { plural } from '@shared/lib/plural';
import { Avatar } from '@shared/ui';

import { ConsentBadge } from './ConsentBadge';

import './ChainDetail.scss';

interface ChainDetailProps {
  chain: Chain;
  onConfirm: () => void;
  onProceed: () => void;
}

// Схема цепочки: строки по звеньям кольца. Отклик на кандидата — на экране товара цепочки
// и на карточке списка, здесь только статусы откликов и действие второго раунда
export function ChainDetail({ chain, onConfirm, onProceed }: ChainDetailProps) {
  const { token } = theme.useToken();
  const links = chainLinks(chain);
  const me = myParticipant(chain);
  const canVote = chain.status === 'CANDIDATE';
  const assembled = isAssembled(chain.status);
  // голос привязан к цели голосования, а не к голосующему: решение участника позиции p лежит
  // в vote следующей по кольцу позиции; на CANDIDATE сдвига нет — там это отклики
  const showConfirmPills = chain.status !== 'CANDIDATE';

  return (
    <div className="chain-detail">
      {assembled ? (
        <div className="chain-detail__head">
          <p className="chain-detail__ready">Цепочка собрана</p>
          <ConsentBadge count={approvedVotes(chain)} total={chain.length} />
        </div>
      ) : null}
      <ul className="chain-detail__participants">
        {links.map((link) => (
          <ChainLinkRow
            key={link.position}
            link={link}
            isMine={me?.position === link.position}
            isReceiveLink={link.position === chain.receivesFromPosition}
            canVote={canVote}
            confirmVote={showConfirmPills ? confirmVoteAt(chain, link.position) : undefined}
          />
        ))}
      </ul>
      {needsMyAction(chain) ? (
        <Button
          className="chain-detail__action"
          type="primary"
          size="large"
          block
          onClick={onConfirm}
        >
          Требуются действия
        </Button>
      ) : chain.status === 'PROPOSED' && myConfirmVote(chain) === 'approved' ? (
        <p className="chain-detail__confirmed" role="status">
          Вы подтвердили · ждём остальных
        </p>
      ) : hasDeal(chain.status) ? (
        <Button
          className="chain-detail__action"
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
  );
}

interface ChainLinkRowProps {
  link: ChainLink;
  isMine: boolean;
  isReceiveLink: boolean;
  canVote: boolean;
  confirmVote?: VoteValue | null;
}

function ChainLinkRow({ link, isMine, isReceiveLink, canVote, confirmVote }: ChainLinkRowProps) {
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
        {confirmVote !== undefined ? <ConfirmVotePill vote={confirmVote} /> : null}
      </div>

      {candidates.length === 1 ? (
        <ChainLinkItem participant={candidates[0]} canVote={canVote} />
      ) : isReceiveLink ? (
        // на получаемом звене пул показан полностью — у каждой записи свой статус отклика
        <ul className="chain-detail__candidates">
          {candidates.map((candidate) => (
            <li key={candidate.requestId} className="chain-detail__candidate">
              <ChainLinkItem participant={candidate} canVote={canVote} />
            </li>
          ))}
        </ul>
      ) : (
        // кандидаты остальных звеньев для отклика не нужны — сворачиваем их в счётчик
        <span className="chain-detail__collapsed">
          {candidates.length} {plural(candidates.length, ['вариант', 'варианта', 'вариантов'])}
        </span>
      )}
    </li>
  );
}

// пилюля голоса второго раунда в шапке строки звена; null — вакансия после отказа
function ConfirmVotePill({ vote }: { vote: VoteValue | null }) {
  const meta = vote === null ? VACANCY_META : CONFIRM_VOTE_META[vote];
  return (
    <span className={`chain-detail__confirm chain-detail__confirm--${meta.tone}`}>
      {meta.label}
    </span>
  );
}

interface ChainLinkItemProps {
  participant: ChainParticipant;
  canVote: boolean;
}

// Одна запись кандидата в звене: миниатюра, товар и «что хочет взамен», статус отклика.
// Пилюли первого раунда на собранной цепочке не показываются — там у vote другой смысл.
function ChainLinkItem({ participant, canVote }: ChainLinkItemProps) {
  const voteMeta = canVote && participant.vote ? VOTE_META[participant.vote] : null;

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
          {voteMeta.label}
        </span>
      ) : null}
    </div>
  );
}
