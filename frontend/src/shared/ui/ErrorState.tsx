import { WarningOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import './ui.scss';

interface ErrorStateProps {
  onRetry: () => void;
  className?: string;
}

export function ErrorState({ onRetry, className = '' }: ErrorStateProps) {
  return (
    <div className={`error-state ${className}`.trim()}>
      <WarningOutlined className="error-state__icon" aria-hidden />
      <p className="error-state__title">Что-то пошло не так</p>
      <p className="error-state__description">Не удалось загрузить данные. Повторите попытку.</p>
      <Button className="error-state__retry" onClick={onRetry}>
        Повторить попытку
      </Button>
    </div>
  );
}
