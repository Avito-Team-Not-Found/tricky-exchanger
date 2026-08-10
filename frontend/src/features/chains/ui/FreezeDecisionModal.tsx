import { useState } from 'react';

import { Button } from 'antd';

import './FreezeDecisionModal.scss';

export interface FreezeDecisionModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onDecline: () => void;
  onThink: () => void;
}

// Модалка «Готовность к сделке» (SOFT-LOCK §6.1): заголовок, вопрос и кнопки «Да»/«Я подумаю»/
// «Отказ»/«Отмена» блоками в колонку. Открывается через App.useApp().modal — antd-Modal не
// импортируется (no-restricted-imports), а `title` confirm-модалки не используется: он рендерится
// дважды (в заголовке модалки и в confirm-title), поэтому заголовок живёт здесь же в контенте.
// «Да» держит loading, пока не пришёл ответ сервера; модалка закрывается только после него,
// при ошибке остаётся открытой — тост объясняет, что пошло не так. «Я подумаю» ведёт на модалку
// §6.2, «Отказ» — отказ от сделки, действие необратимое, поэтому подтверждается отдельной
// модалкой (§6.3), а не шлёт запрос сразу.
export function FreezeDecisionModal({
  onClose,
  onConfirm,
  onDecline,
  onThink,
}: FreezeDecisionModalProps) {
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
      <p className="freeze-decision__subtitle">Это действие заблокирует другие цепочки</p>
      <p className="freeze-decision__question">Приступаем к сделке?</p>
      <div className="freeze-decision__actions">
        <Button type="primary" block loading={pending} onClick={confirm}>
          Да
        </Button>
        <Button block disabled={pending} onClick={onThink}>
          Я подумаю
        </Button>
        <Button type="text" danger block disabled={pending} onClick={onDecline}>
          Отказ
        </Button>
        <Button block disabled={pending} onClick={onClose}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
