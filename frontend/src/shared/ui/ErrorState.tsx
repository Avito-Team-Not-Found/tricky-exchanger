import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import './ui.scss';

interface ErrorStateProps {
  onRetry: () => void;
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="error-state">
      <ExclamationCircleOutlined className="error-state__icon" aria-hidden />
      <p className="error-state__title">Что-то пошло не так</p>
      <Button onClick={onRetry}>Повторить попытку</Button>
    </div>
  );
}
