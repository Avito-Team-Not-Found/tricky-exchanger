import { useState } from 'react';

import { Button, Radio } from 'antd';

import './DealDisputeModal.scss';

// ручки спора у бэкенда нет: причина никуда не уходит и нужна только для осмысленного выбора
const DISPUTE_REASONS = ['Товар не тот', 'Товар испорчен', 'Другое'] as const;

interface DealDisputeModalProps {
  onClose: () => void;
  onConfirm: (reason: (typeof DISPUTE_REASONS)[number]) => void;
}

// antd-Modal не импортируется (no-restricted-imports), поэтому заголовок живёт в контенте
export function DealDisputeModal({ onClose, onConfirm }: DealDisputeModalProps) {
  const [reason, setReason] = useState<(typeof DISPUTE_REASONS)[number] | null>(null);

  return (
    <div className="deal-dispute">
      <p className="deal-dispute__title">Открыть спор?</p>
      <p className="deal-dispute__text">
        Мы передадим ваше обращение в службу поддержки и свяжемся с вами в течение 24 часов.
      </p>
      <Radio.Group
        className="deal-dispute__reasons"
        orientation="vertical"
        value={reason ?? undefined}
        onChange={(event) => setReason(event.target.value as (typeof DISPUTE_REASONS)[number])}
      >
        {DISPUTE_REASONS.map((item) => (
          <Radio key={item} value={item} className="deal-dispute__reason">
            {item}
          </Radio>
        ))}
      </Radio.Group>
      <div className="deal-dispute__actions">
        <Button onClick={onClose}>Отмена</Button>
        <Button
          type="primary"
          danger
          disabled={!reason}
          onClick={() => reason && onConfirm(reason)}
        >
          Открыть спор
        </Button>
      </div>
    </div>
  );
}
