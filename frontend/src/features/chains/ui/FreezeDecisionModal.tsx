import { useState } from 'react';

import { Button } from 'antd';

import './FreezeDecisionModal.scss';

export interface FreezeDecisionModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

// Модалка «Готовность к сделке» (SOFT-LOCK §6.1): заголовок, вопрос и кнопки «Да»/«Отмена»
// блоками в колонку. Открывается через App.useApp().modal — antd-Modal не импортируется
// (no-restricted-imports), а `title` confirm-модалки не используется: он рендерится дважды
// (в заголовке модалки и в confirm-title), поэтому заголовок живёт здесь же в контенте.
// «Да» держит loading, пока не пришёл ответ сервера; модалка закрывается только после него,
// при ошибке остаётся открытой — тост объясняет, что пошло не так.
export function FreezeDecisionModal({ onClose, onConfirm }: FreezeDecisionModalProps) {
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
        <Button block disabled={pending} onClick={onClose}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
