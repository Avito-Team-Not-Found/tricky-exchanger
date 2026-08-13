import { useRef, useState, type ChangeEvent } from 'react';

import { ClockCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Input, Select } from 'antd';

import { myParticipant, sourceParticipant, type Chain } from '@entities/chain';

import { FadeInImage } from '@shared/ui';

import { PICKUP_POINTS } from '../model/pickupPoints';
import { useDealFulfillment } from '../model/useDealFulfillment';
import { useDealPhoto } from '../model/useDealPhoto';
import { usePickupPoint } from '../model/usePickupPoint';

import { DealBarcode } from './DealBarcode';
import { DealItemSwap } from './DealItemSwap';
import { DealPickupCard } from './DealPickupCard';
import { DealSafetyBanner } from './DealSafetyBanner';

import './deal.scss';
import './DealShipView.scss';

interface DealShipViewProps {
  chain: Chain;
  deadlineAt: string | null;
  onOpenDetails: () => void;
}

// таймер показывает фактическое значение freezeDeadlineAt, а не условные 47:58
function deadlineLabel(deadlineAt: string | null): string | null {
  if (!deadlineAt) return null;
  const remaining = new Date(deadlineAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  const totalMinutes = Math.floor(remaining / 60_000);
  return `Осталось ${Math.floor(totalMinutes / 60)} ч ${totalMinutes % 60} мин на отправку`;
}

// «Я отправил товар» — заглушка: в проде отправку подтверждала бы интеграция с доставкой,
// а фото упаковки и адрес ПВЗ бэкенд не хранит вовсе
export function DealShipView({ chain, deadlineAt, onOpenDetails }: DealShipViewProps) {
  const { message, modal } = AntApp.useApp();
  const me = myParticipant(chain);
  const source = sourceParticipant(chain);
  const { confirmHandoff, isFulfilling } = useDealFulfillment(chain);
  const { point, setPoint } = usePickupPoint(chain.id);
  const { photo, setPhotoFile, removePhoto } = useDealPhoto(chain.id, chain.currentRequestId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // модалка живёт в портале вне дерева роутов — закрываем руками, как остальные модалки сделки
  const pickupModal = useRef<{ destroy: () => void } | null>(null);

  const myItemTitle = me?.offeredItemTitle ?? 'Товар';
  const receiveTitle = source?.offeredItemTitle ?? 'Товар';
  const timer = deadlineLabel(deadlineAt);

  const pickFile = () => fileInputRef.current?.click();

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await setPhotoFile(file);
    } catch {
      // файл не прочитался (битый снимок) — подсказка под кнопкой объясняет, почему она заблокирована
      message.warning('Не удалось загрузить фото');
    }
  };

  const closePickupModal = () => {
    pickupModal.current?.destroy();
    pickupModal.current = null;
  };

  const openPickupModal = () => {
    pickupModal.current = modal.confirm({
      icon: null,
      centered: true,
      width: 311,
      // клик по маске не должен отменять выбор ПВЗ — изменение применяется только кнопкой «Сохранить»
      maskClosable: false,
      content: <DealPickupForm current={point} onSave={setPoint} onClose={closePickupModal} />,
      footer: null,
    });
  };

  return (
    <div className="deal-ship">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="deal-ship__file"
        onChange={handleFile}
        aria-hidden
        tabIndex={-1}
      />

      <DealBarcode chainId={chain.id} kind="handoff" />

      {deadlineAt ? (
        <p
          className={`deal-ship__timer${timer ? '' : ' deal-ship__timer--expired'}`}
          role={timer ? 'timer' : 'status'}
        >
          <span className="deal-ship__timer-icon" aria-hidden>
            <ClockCircleOutlined />
          </span>
          {timer ?? 'Срок отправки истёк'}
        </p>
      ) : null}

      <DealItemSwap
        label="Вы отправляете"
        giveTitle={myItemTitle}
        giveImageUrl={me?.imageUrl}
        receiveTitle={receiveTitle}
        receiveImageUrl={source?.imageUrl}
      />

      <DealSafetyBanner
        label="Мы сохраним ваш товар"
        message="Ваш товар в безопасности: товары не будут отправлены, пока все участники не принесли их."
      />

      <section className="deal-ship__section">
        <h2 className="deal-ship__section-title">Что нужно сделать</h2>
        <ol className="deal-ship__steps">
          <li>1. Упакуйте товар «{myItemTitle}».</li>
          <li>2. Отнесите его на ближайший пункт выдачи Авито (ПВЗ).</li>
          <li>3. Сфотографируйте товар перед отправкой и прикрепите фото ниже.</li>
        </ol>
      </section>

      <div className="deal-ship__pickup">
        <h2 className="deal-ship__section-title">Где будем получать?</h2>
        <DealPickupCard address={point} onChange={openPickupModal} />
      </div>

      <section className="deal-ship__photo">
        <p className="deal-ship__photo-label">
          Фото товара перед отправкой <span aria-hidden>*</span>
        </p>
        {photo ? (
          <div className="deal-ship__photo-preview">
            <FadeInImage
              className="deal-ship__photo-img"
              src={photo}
              alt="Фото товара перед отправкой"
            />
            <div className="deal-ship__photo-controls">
              <Button size="small" onClick={pickFile}>
                Заменить фото
              </Button>
              <Button size="small" danger onClick={removePhoto}>
                Удалить
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" className="deal-ship__photo-upload" onClick={pickFile}>
            <span className="deal-ship__photo-icon" aria-hidden>
              <UploadOutlined />
            </span>
            <span>Прикрепить фото</span>
          </button>
        )}
      </section>

      <div className="deal-actions">
        <Button
          type="primary"
          size="large"
          block
          loading={isFulfilling}
          disabled={!photo}
          onClick={confirmHandoff}
        >
          Я отправил товар
        </Button>
        {!photo ? (
          <p className="deal-actions__hint">Прикрепите фото товара перед отправкой</p>
        ) : null}
        <p className="deal-actions__hint">
          Обычно это подтверждает пункт выдачи — в демо подтверждаете вы
        </p>
        <Button size="large" block onClick={onOpenDetails}>
          Посмотреть детали цепочки
        </Button>
      </div>
    </div>
  );
}

// пустой адрес не сохраняется — «Сохранить» с пустым полем просто закрывает модалку
function DealPickupForm({
  current,
  onSave,
  onClose,
}: {
  current: string;
  onSave: (address: string) => void;
  onClose: () => void;
}) {
  const CUSTOM_VALUE = '__custom__';
  // сохранённый ранее «Другой адрес» не входит в зашитый список — открываем модалку в режиме
  // ввода с уже заполненным адресом, а не молча переключаем на первый пункт списка
  const [value, setValue] = useState<string>(
    PICKUP_POINTS.includes(current) ? current : CUSTOM_VALUE,
  );
  const [custom, setCustom] = useState<string>(PICKUP_POINTS.includes(current) ? '' : current);
  const isCustom = value === CUSTOM_VALUE;

  const save = () => {
    const address = (isCustom ? custom : value).trim();
    if (!address) return;
    onSave(address);
    onClose();
  };

  return (
    <div className="deal-pickup-form">
      <Select
        className="deal-pickup-form__select"
        value={value}
        options={[
          ...PICKUP_POINTS.map((point) => ({ value: point, label: point })),
          { value: CUSTOM_VALUE, label: 'Другой адрес' },
        ]}
        onChange={setValue}
      />
      {isCustom ? (
        <Input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Введите адрес"
          maxLength={200}
        />
      ) : null}
      <Button type="primary" block onClick={save}>
        Сохранить
      </Button>
    </div>
  );
}
