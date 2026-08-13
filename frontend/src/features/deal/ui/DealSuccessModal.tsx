import { Button } from 'antd';

import './DealSuccessModal.scss';

interface DealSuccessModalProps {
  emoji: string;
  title: string;
  text: string;
  onClose: () => void;
}

// Контент модалок успеха сделки («Получение подтверждено», «Жалоба отправлена»,
// «Безопасность сделки»): крупный эмодзи-глиф, заголовок, пояснение и «Понятно». Открывается
// через App.useApp().modal — antd-Modal не импортируется (no-restricted-imports), поэтому
// заголовок живёт здесь же в контенте, а не в title модалки.
export function DealSuccessModal({ emoji, title, text, onClose }: DealSuccessModalProps) {
  return (
    <div className="deal-success">
      <p className="deal-success__icon" aria-hidden>
        {emoji}
      </p>
      <p className="deal-success__title">{title}</p>
      <p className="deal-success__text">{text}</p>
      <Button className="deal-success__button" type="primary" block onClick={onClose}>
        Понятно
      </Button>
    </div>
  );
}
