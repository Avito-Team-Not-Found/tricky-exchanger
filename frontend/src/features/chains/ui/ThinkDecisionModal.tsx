import { useState } from 'react';

import { Button } from 'antd';

import './ThinkDecisionModal.scss';

export interface ThinkDecisionModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onBack: () => void;
}

// Модалка «Пока вы думаете» (SOFT-LOCK §6.2): предупреждение и «Да» → POST /chains/{id}/think.
// «Вернуться» возвращает к модалке «Готовность к сделке» без запросов. «Да» держит loading до
// ответа сервера; режим «подумаю» включается только после успешного ответа — состояние должно
// совпадать с серверным голосом, иначе карточка разойдётся с myVote при первом же refetch.
export function ThinkDecisionModal({ onClose, onConfirm, onBack }: ThinkDecisionModalProps) {
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
    <div className="think-decision">
      <span className="think-decision__icon" aria-hidden>
        ⏳
      </span>
      <p className="think-decision__title">Вы уверены?</p>
      <p className="think-decision__text">
        Пока вы думаете, ваше место в цепочке могут занять другие участники.
      </p>
      <div className="think-decision__actions">
        <Button type="primary" block loading={pending} onClick={confirm}>
          Да
        </Button>
        <Button block disabled={pending} onClick={onBack}>
          Вернуться
        </Button>
      </div>
    </div>
  );
}
