import { useState } from 'react';

import { Button } from 'antd';

import './FreezeDecisionModal.scss';

export interface FreezeDecisionModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onDecline: () => void;
}

// `title` confirm-модалки не используется: он рендерится дважды, поэтому заголовок живёт
// здесь же в контенте
export function FreezeDecisionModal({ onClose, onConfirm, onDecline }: FreezeDecisionModalProps) {
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setPending(false);
    }
  };

  return (
    <div className="freeze-decision">
      <p className="freeze-decision__title">Все участники найдены</p>
      <p className="freeze-decision__subtitle">
        Подтверждение окончательное: отменить его будет нельзя
      </p>
      <p className="freeze-decision__question">Приступаем к сделке?</p>
      <div className="freeze-decision__actions">
        <Button type="primary" block loading={pending} onClick={confirm}>
          Да
        </Button>
        <Button type="text" danger block disabled={pending} onClick={onDecline}>
          Отказ
        </Button>
        <Button block disabled={pending} onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}
