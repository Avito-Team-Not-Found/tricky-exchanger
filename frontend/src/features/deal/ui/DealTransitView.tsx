import { useRef } from 'react';

import { App as AntApp, Button } from 'antd';

import {
  myParticipant,
  sourceParticipant,
  type Chain,
  type ChainParticipant,
} from '@entities/chain';

import { FadeInImage } from '@shared/ui';

import { useDealFulfillment } from '../model/useDealFulfillment';
import { useDispute } from '../model/useDispute';
import { usePickupPoint } from '../model/usePickupPoint';

import { DealItemSwap } from './DealItemSwap';
import { DealPickupCard } from './DealPickupCard';
import { DealSafetyBanner } from './DealSafetyBanner';
import { DealSuccessModal } from './DealSuccessModal';
import { DealTrackingModal } from './DealTrackingModal';

import './deal.scss';
import './DealTransitView.scss';

interface DealTransitViewProps {
  chain: Chain;
  state:
    | { status: 'shipped-waiting'; shipped: number; total: number }
    | { status: 'in-transit'; shipped: number; total: number };
  onOpenDetails: () => void;
}

// Статусы доставки товаров экрана сделки: пилюля по статусу заявки владельца товара (DEAL-PLAN.md
// §4.3). Подпись текстом обязательна — статус не передаётся одним цветом (DESIGN.md §1.8).
function deliveryPill(status: ChainParticipant['requestStatus']): {
  label: string;
  tone: 'warning' | 'accent' | 'success';
} {
  switch (status) {
    case 'DONE':
      return { label: 'Доставлено', tone: 'success' };
    case 'IN_PROGRESS':
      // товар лежит в ПВЗ, пока все его не принесли — до отправки последнего «в пути» он не едет
      return { label: 'Отправлен', tone: 'accent' };
    default:
      return { label: 'Ожидает отправки', tone: 'warning' };
  }
}

// Экраны «Товары в пути» и «Все товары доставлены» (макет 4.9): пока отправили не все — ждём
// остальных со статусом доставки каждого товара и заблокированной кнопкой получения, когда все
// отправили — «Все товары доставлены» и кнопка «Я забрал товар». Кнопки-заглушки вместо ПВЗ
// (DEAL-PLAN.md §4.5): «Я забрал товар» дёргает POST /chains/{id}/receipt.
export function DealTransitView({ chain, state, onOpenDetails }: DealTransitViewProps) {
  const { modal } = AntApp.useApp();
  const { confirmReceipt, isFulfilling } = useDealFulfillment(chain);
  const { point } = usePickupPoint(chain.id);
  const { disputed, openDispute } = useDispute(chain.id);
  // модалки живут в портале вне дерева роутов — закрываем их руками, как остальные модалки сделки
  const tracking = useRef<{ destroy: () => void } | null>(null);
  const dispute = useRef<{ destroy: () => void } | null>(null);

  const closeTracking = () => {
    tracking.current?.destroy();
    tracking.current = null;
  };

  const openTracking = (participant: ChainParticipant) => {
    tracking.current = modal.confirm({
      icon: null,
      centered: true,
      width: 311,
      content: (
        <DealTrackingModal
          title={participant.offeredItemTitle}
          status={participant.requestStatus}
          onClose={closeTracking}
        />
      ),
      footer: null,
    });
  };

  const closeDisputeModal = () => {
    dispute.current?.destroy();
    dispute.current = null;
  };

  const openDisputeConfirm = () => {
    modal.confirm({
      title: 'Открыть спор?',
      content:
        'Мы передадим ваше обращение в службу поддержки и свяжемся с вами в течение 24 часов.',
      okText: 'Открыть спор',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      centered: true,
      onOk: () => {
        openDispute();
        dispute.current = modal.confirm({
          icon: null,
          centered: true,
          width: 311,
          content: (
            <DealSuccessModal
              emoji="🛠"
              title="Жалоба отправлена"
              text="Мы получили ваше обращение и свяжемся с вами в течение 24 часов, чтобы разобраться в ситуации."
              onClose={closeDisputeModal}
            />
          ),
          footer: null,
        });
      },
    });
  };

  // пока отправили не все — ждём остальных (макеты B/C «Товары в пути»)
  if (state.status === 'shipped-waiting') {
    return (
      <div className="deal-transit">
        <div className="deal-hero">
          <p className="deal-hero__icon" aria-hidden>
            🚚
          </p>
          <p className="deal-hero__title">Вы отправили товар</p>
          <p className="deal-hero__text">Ждём, пока остальные участники принесут свои товары</p>
        </div>

        <DealSafetyBanner
          label="Сделка защищена"
          message="Пользователи смогут получить товары только тогда, когда все товары будут доставлены."
        />

        <section className="deal-transit__section">
          <div className="deal-transit__section-head">
            <h2 className="deal-transit__section-title">Статус доставки</h2>
            <span className="deal-transit__count">
              {state.shipped} из {state.total} отправлено
            </span>
          </div>
          <ul className="deal-transit__items">
            {chain.participants.map((participant) => {
              const pill = deliveryPill(participant.requestStatus);
              return (
                <li key={participant.requestId} className="deal-transit__item">
                  <ItemThumb participant={participant} />
                  <span className="deal-transit__item-main">
                    <span className="deal-transit__item-name">{participant.offeredItemTitle}</span>
                    <span
                      className={`deal-transit__item-pill deal-transit__item-pill--${pill.tone}`}
                    >
                      {pill.label}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="deal-transit__item-more"
                    aria-label={`Трекинг: ${participant.offeredItemTitle}`}
                    onClick={() => openTracking(participant)}
                  >
                    ›
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="deal-actions">
          <Button type="primary" size="large" block disabled>
            Я забрал товар
          </Button>
          <p className="deal-actions__hint">Дождитесь, пока отправитель принесёт товар</p>
          <Button size="large" block onClick={onOpenDetails}>
            Посмотреть детали цепочки
          </Button>
        </div>
      </div>
    );
  }

  // in-transit: все отправили, мой товар уже в пункте выдачи — могу забрать
  const me = myParticipant(chain);
  const source = sourceParticipant(chain);
  // в гонке статусов источник мог быть ещё LOCKED — кнопку держим заблокированной до рефетча (§11)
  const canReceive = source?.requestStatus === 'IN_PROGRESS';

  return (
    <div className="deal-transit">
      <div className="deal-hero deal-hero--success">
        <p className="deal-hero__icon" aria-hidden>
          ✅
        </p>
        <p className="deal-hero__title">Все товары доставлены</p>
        <p className="deal-hero__text">
          Ваш товар уже в пункте выдачи. Заберите его в удобное время.
        </p>
      </div>

      <DealPickupCard address={point} />

      <DealItemSwap
        label="Вы получите"
        giveTitle={me?.offeredItemTitle ?? 'Товар'}
        giveImageUrl={me?.imageUrl}
        receiveTitle={source?.offeredItemTitle ?? 'Товар'}
        receiveImageUrl={source?.imageUrl}
      />

      {disputed ? (
        <p className="deal-transit__disputed" role="status">
          Жалоба на рассмотрении
        </p>
      ) : (
        <div className="deal-transit__dispute">
          <span>Проблемы с товаром?</span>
          <Button type="link" size="small" onClick={openDisputeConfirm}>
            Открыть спор
          </Button>
        </div>
      )}

      <div className="deal-actions">
        <Button
          type="primary"
          size="large"
          block
          loading={isFulfilling}
          disabled={!canReceive}
          onClick={confirmReceipt}
        >
          Я забрал товар
        </Button>
        {canReceive ? (
          <p className="deal-actions__hint">
            Обычно это подтверждает пункт выдачи — в демо подтверждаете вы
          </p>
        ) : (
          <p className="deal-actions__hint">Дождитесь, пока отправитель принесёт товар</p>
        )}
        <Button size="large" block onClick={onOpenDetails}>
          Посмотреть детали цепочки
        </Button>
      </div>
    </div>
  );
}

function ItemThumb({ participant }: { participant: ChainParticipant }) {
  return (
    <span
      className={`deal-transit__thumb${participant.imageUrl ? '' : ' deal-transit__thumb--empty'}`}
      aria-hidden
    >
      {participant.imageUrl ? (
        <FadeInImage className="deal-transit__thumb-img" src={participant.imageUrl} alt="" />
      ) : (
        (participant.offeredItemTitle[0] ?? '')
      )}
    </span>
  );
}
