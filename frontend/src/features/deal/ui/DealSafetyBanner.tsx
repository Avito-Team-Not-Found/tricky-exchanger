import { useRef } from 'react';

import { App as AntApp } from 'antd';

import { DealSuccessModal } from './DealSuccessModal';

import './DealSafetyBanner.scss';

interface DealSafetyBannerProps {
  label: string;
  message: string;
}

// значение не передаётся одним цветом — перед текстом стоит замок
export function DealSafetyBanner({ label, message }: DealSafetyBannerProps) {
  const { modal } = AntApp.useApp();
  // модалка живёт в портале вне дерева роутов: закрываем руками, как остальные модалки сделки
  const safety = useRef<{ destroy: () => void } | null>(null);

  const close = () => {
    safety.current?.destroy();
    safety.current = null;
  };

  const open = () => {
    safety.current = modal.confirm({
      icon: null,
      centered: true,
      width: 311,
      content: (
        <DealSuccessModal
          emoji="🔒"
          title="Ваш товар в безопасности"
          text={message}
          onClose={close}
        />
      ),
      footer: null,
    });
  };

  return (
    <button type="button" className="deal-safety" onClick={open}>
      <span className="deal-safety__icon" aria-hidden>
        🔒
      </span>
      <span className="deal-safety__label">{label}</span>
      <span className="deal-safety__arrow" aria-hidden>
        ›
      </span>
    </button>
  );
}
