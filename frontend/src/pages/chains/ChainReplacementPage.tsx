import { useState } from 'react';

import { Button, Skeleton } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { ReplacementCandidateCard, useReplacementSelection } from '@features/chains';

import { type Chain, type ReplacementOption } from '@entities/chain';

import { pluralizeRu } from '@shared/lib/pluralize';
import { EmptyState, ErrorState, StatusTag } from '@shared/ui';

import { ChainPageHeader } from './ChainPageHeader';

import './ChainReplacementPage.scss';

// инкрементальная клиентская подгрузка (TZ §7.1): сервер отдаёт весь пул одним массивом
const PAGE_SIZE = 10;

// Экран замены участника (макеты 4.8 «Замена участника»): конечный автомат из четырёх состояний
// (TZ §4). Страница — «глупый» рендер, вся логика в useReplacementSelection.
export function ChainReplacementPage() {
  const { chainId: chainIdParam } = useParams<{ chainId: string }>();
  const navigate = useNavigate();
  const chainId = chainIdParam ? Number(chainIdParam) : undefined;
  const {
    options,
    isLoading,
    isError,
    refetch,
    selectedId,
    setSelectedId,
    invite,
    isInviting,
    abandon,
    isAbandoning,
    stage,
    chain,
    invitedOption,
  } = useReplacementSelection(chainId);

  // Заголовок отказавшегося товара — участник на позиции вакансии. participants — это пул, а не
  // по записи на позицию: имя показываем, только если кандидат на вакантной позиции ровно один
  // (так же страхуется ChainItemView), иначе формулировка без товара.
  const vacant =
    chain?.participants.filter(
      (participant) => participant.position === chain.receivesFromPosition,
    ) ?? [];
  const declinedTitle = vacant.length === 1 ? vacant[0].offeredItemTitle : null;
  // «Назад» не может вести на цепочку, которой уже нет (TZ §3.3)
  const backTo = stage === 'rolledBack' ? '/exchange-requests' : `/chains/${chainId}`;

  return (
    <div className="chain-detail-page">
      <ChainPageHeader title="Замена участника" onBack={() => navigate(backTo)} />

      <div className="chain-detail-page__body">
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : isError ? (
          <ErrorState onRetry={refetch} />
        ) : stage === 'selecting' ? (
          options.length > 0 ? (
            <CandidateList
              // счётчик подгрузки сбрасывается, когда сервер вернул другой пул (TZ §7.1):
              // состав пула — и есть идентичность списка, ремонтировать его иначе незачем
              key={options.map((option) => option.requestId).join(',')}
              options={options}
              declinedTitle={declinedTitle}
              selectedId={selectedId}
              onSelect={setSelectedId}
              isInviting={isInviting}
              isAbandoning={isAbandoning}
              onInvite={invite}
              onAbandon={abandon}
            />
          ) : (
            // Гейт «только актору» из TZ §11.1 не реализуем: тело цепочки отдаётся относительно
            // читателя (receivesFromPosition = currentPosition + 1), поэтому «актор» по данным
            // GET /chains/{id} — это всегда сам читатель, и проверка вырождается в тавтологию.
            // Кнопка безопасна: decline — собственный отказ участника, а не действие над чужим.
            // Различать актора должен сервер, отдавая non-актору 403 (TZ §11.1, задача на бэкенд).
            <EmptyState
              title="Замен не нашлось"
              description="Подходящих участников для этой позиции сейчас нет. Цепочку придётся расформировать"
            >
              <Button loading={isAbandoning} onClick={abandon}>
                Расформировать цепочку
              </Button>
            </EmptyState>
          )
        ) : stage === 'waiting' ? (
          <WaitingView chainId={chainId} invitedOption={invitedOption} />
        ) : stage === 'succeeded' ? (
          <SucceededView chain={chain} />
        ) : (
          <RolledBackView chain={chain} />
        )}
      </div>
    </div>
  );
}

interface CandidateListProps {
  options: ReplacementOption[];
  declinedTitle: string | null;
  selectedId: number | null;
  onSelect: (requestId: number) => void;
  isInviting: boolean;
  isAbandoning: boolean;
  onInvite: () => void;
  onAbandon: () => void;
}

// Экран «Выбор кандидата» (TZ §5.1): контекст-блок, список CandidateCard и sticky-футер с действиями.
function CandidateList({
  options,
  declinedTitle,
  selectedId,
  onSelect,
  isInviting,
  isAbandoning,
  onInvite,
  onAbandon,
}: CandidateListProps) {
  // пул кластера ограничен по размеру — подгрузка по 10 без виртуализации (TZ §7.1)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visible = options.slice(0, visibleCount);
  const remaining = options.length - visibleCount;

  return (
    <>
      <fieldset className="replacement-fieldset">
        <legend className="replacement-fieldset__legend">Кандидаты на замену</legend>
        <div className="replacement-context">
          <p className="replacement-context__title">
            {declinedTitle
              ? `Участник с товаром «${declinedTitle}» отказался участвовать`
              : 'Участник цепочки отказался участвовать'}
          </p>
          <p className="replacement-context__hint">
            Выберите подходящую замену, чтобы продолжить обмен
          </p>
        </div>
        <ul className="replacement-list">
          {visible.map((option) => (
            <li key={option.requestId} className="replacement-list__item">
              <ReplacementCandidateCard
                option={option}
                selected={option.requestId === selectedId}
                disabled={isInviting}
                onSelect={() => onSelect(option.requestId)}
              />
            </li>
          ))}
        </ul>
        {remaining > 0 ? (
          <Button
            className="replacement-more"
            type="link"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Показать ещё ({remaining})
          </Button>
        ) : null}
      </fieldset>
      <div className="replacement-footer">
        <Button
          className="replacement-footer__secondary"
          disabled={isInviting || isAbandoning}
          loading={isAbandoning}
          onClick={onAbandon}
        >
          Ни одна из замен не подходит
        </Button>
        <Button
          className="replacement-footer__primary"
          type="primary"
          size="large"
          disabled={!selectedId || isInviting || isAbandoning}
          loading={isInviting}
          onClick={onInvite}
        >
          Пригласить замену
        </Button>
      </div>
    </>
  );
}

// Экран «Приглашение отправлено» (TZ §5.4): статус-иконка, приглашённый кандидат, переход к цепочке.
function WaitingView({
  chainId,
  invitedOption,
}: {
  chainId?: number;
  invitedOption: ReplacementOption | null;
}) {
  const navigate = useNavigate();
  return (
    <div className="replacement-status" role="status" aria-live="polite">
      <span className="replacement-status__icon replacement-status__icon--warning">
        <span aria-hidden>⏳</span>
      </span>
      <h2 className="replacement-status__title">Ждём ответа кандидата</h2>
      <p className="replacement-status__text">
        Кандидату отправлено приглашение.
        <br />
        Он ответит в течение 24 часов.
      </p>
      {invitedOption ? <ReplacementCandidateCard option={invitedOption} /> : null}
      <Button
        className="replacement-status__cta"
        type="primary"
        size="large"
        block
        onClick={() => navigate(`/chains/${chainId}`)}
      >
        К цепочке
      </Button>
    </div>
  );
}

// Экран «Замена подтверждена» (TZ §5.5): статус-иконка и сводка собранной цепочки.
function SucceededView({ chain }: { chain?: Chain }) {
  const navigate = useNavigate();
  if (!chain) return null;
  // одна миниатюра на звено кольца: participants — пул, и без схлопывания по позиции ряд
  // разошёлся бы со счётчиком «N участников» под ним (N = chain.length)
  const participants = [...chain.participants]
    .sort((a, b) => a.position - b.position)
    .filter(
      (participant, index, sorted) =>
        index === 0 || participant.position !== sorted[index - 1].position,
    );

  return (
    <div className="replacement-status" role="status" aria-live="polite">
      <span className="replacement-status__icon replacement-status__icon--success">
        <span aria-hidden>✓</span>
      </span>
      <h2 className="replacement-status__title">Замена подтверждена</h2>
      <p className="replacement-status__text">
        Кандидат согласился участвовать.
        <br />
        Цепочка обновлена.
      </p>
      <div className="replacement-summary">
        <p className="replacement-summary__caption">Новая цепочка</p>
        <div className="replacement-summary__chain">
          {participants.map((participant, index) => (
            <span key={participant.requestId} className="replacement-summary__link">
              <span className="replacement-summary__thumb" aria-hidden>
                {participant.imageUrl ? (
                  <img
                    className="replacement-summary__thumb-img"
                    src={participant.imageUrl}
                    alt=""
                  />
                ) : null}
              </span>
              {index < participants.length - 1 ? (
                <span className="replacement-summary__arrow" aria-hidden>
                  →
                </span>
              ) : null}
            </span>
          ))}
        </div>
        <StatusTag tone="success">Цепочка собрана</StatusTag>
        <p className="replacement-summary__count">
          {chain.length} {pluralizeRu(chain.length, 'участник', 'участника', 'участников')} в
          цепочке
        </p>
      </div>
      <Button
        className="replacement-status__cta"
        type="primary"
        size="large"
        block
        onClick={() => navigate(`/chains/${chain.id}`)}
      >
        К цепочке
      </Button>
    </div>
  );
}

// Откат (TZ §4.1): у цепочки нет отдельного борда — верстается на ErrorState с навигацией на живой экран.
function RolledBackView({ chain }: { chain?: Chain }) {
  const navigate = useNavigate();
  if (chain?.status === 'CANDIDATE') {
    return (
      <ErrorState
        title="Замена не состоялась"
        description="Кандидат отказался. Цепочка вернулась в список вариантов"
        action={
          <Button onClick={() => navigate(`/exchange-requests/${chain.currentRequestId}`)}>
            К вариантам
          </Button>
        }
      />
    );
  }
  // цепочка ушла дальше по жизненному циклу — замена к ней уже неприменима, но и «расформирована»
  // про живой обмен писать нельзя
  if (chain?.status === 'IN_PROGRESS' || chain?.status === 'COMPLETED') {
    return (
      <ErrorState
        title="Замена больше не нужна"
        description="Цепочка уже подтверждена участниками"
        action={<Button onClick={() => navigate(`/chains/${chain.id}`)}>К цепочке</Button>}
      />
    );
  }
  return (
    <ErrorState
      title="Замена не состоялась"
      description="Цепочка расформирована"
      action={<Button onClick={() => navigate('/exchange-requests')}>К моим запросам</Button>}
    />
  );
}
