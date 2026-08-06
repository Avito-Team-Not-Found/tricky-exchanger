import { useRef } from 'react';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useParams } from 'react-router';

import { ItemForm, type ItemFormHandle } from '@features/items';

import './ItemFormPage.scss';

export function ItemFormPage() {
  const { itemId } = useParams();
  const formRef = useRef<ItemFormHandle>(null);

  return (
    <div className="item-form-page">
      <header className="item-form-page__header">
        <Button
          className="item-form-page__back"
          type="text"
          icon={<ArrowLeftOutlined aria-hidden />}
          aria-label="Назад"
          onClick={() => formRef.current?.confirmLeave()}
        />
        <h1 className="item-form-page__title">
          {itemId ? 'Редактирование товара' : 'Новый товар'}
        </h1>
      </header>
      <div className="item-form-page__body">
        <ItemForm itemId={itemId} ref={formRef} />
      </div>
    </div>
  );
}
