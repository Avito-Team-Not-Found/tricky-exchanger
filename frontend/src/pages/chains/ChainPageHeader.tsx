import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';

interface ChainPageHeaderProps {
  title: string;
  onBack: () => void;
}

// Шапка экранов цепочки: подложка во всю ширину, содержимое — в той же
// колонке, что и тело экрана, чтобы на десктопе заголовок не отрывался от контента
export function ChainPageHeader({ title, onBack }: ChainPageHeaderProps) {
  return (
    <header className="chain-detail-page__header">
      <div className="chain-detail-page__header-inner">
        <Button
          className="chain-detail-page__back"
          type="text"
          icon={<ArrowLeftOutlined aria-hidden />}
          aria-label="Назад"
          onClick={onBack}
        />
        <h1 className="chain-detail-page__title">{title}</h1>
      </div>
    </header>
  );
}
