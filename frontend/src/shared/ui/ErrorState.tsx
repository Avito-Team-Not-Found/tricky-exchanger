import type { ReactNode } from 'react';

import { WarningOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import './ui.scss';

interface ErrorStateProps {
  onRetry?: () => void;
  className?: string;
  // заголовок/описание и действие переопределяются для содержательных ошибок
  // (например, откат замены с кнопкой навигации, TZ §4.1)
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function ErrorState({
  onRetry,
  className = '',
  title,
  description,
  action,
}: ErrorStateProps) {
  return (
    <div className={`error-state ${className}`.trim()}>
      <WarningOutlined className="error-state__icon" aria-hidden />
      <p className="error-state__title">{title ?? 'Что-то пошло не так'}</p>
      <p className="error-state__description">
        {description ?? 'Не удалось загрузить данные. Повторите попытку.'}
      </p>
      {/* без onRetry кнопка «Повторить» была бы мёртвым, но фокусируемым контролом */}
      {action ??
        (onRetry ? (
          <Button className="error-state__retry" onClick={onRetry}>
            Повторить попытку
          </Button>
        ) : null)}
    </div>
  );
}
