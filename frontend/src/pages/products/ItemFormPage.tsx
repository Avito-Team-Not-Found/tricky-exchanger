import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { ItemForm } from '@features/items';

import './ItemFormPage.scss';

export function ItemFormPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnToRequest = searchParams.get('returnTo') === 'request';

  function goBack() {
    navigate(returnToRequest ? '/exchange-requests/new' : '/products');
  }

  return (
    <div className="item-form-page">
      <header className="item-form-page__header">
        <Button
          className="item-form-page__back"
          type="text"
          icon={<ArrowLeftOutlined aria-hidden />}
          aria-label="Назад"
          onClick={goBack}
        />
        <h1 className="item-form-page__title">
          {itemId ? 'Редактирование товара' : 'Новый товар'}
        </h1>
      </header>
      <div className="item-form-page__body">
        <ItemForm itemId={itemId} />
      </div>
    </div>
  );
}
