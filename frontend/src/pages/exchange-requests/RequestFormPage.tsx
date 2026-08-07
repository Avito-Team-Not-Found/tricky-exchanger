import { useRef } from 'react';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useParams } from 'react-router';

import { RequestForm, type RequestFormHandle } from '@features/exchange-requests';

import './RequestFormPage.scss';

export function RequestFormPage() {
  const { requestId } = useParams();
  const formRef = useRef<RequestFormHandle>(null);

  return (
    <div className="request-form-page">
      <header className="request-form-page__header">
        <Button
          className="request-form-page__back"
          type="text"
          icon={<ArrowLeftOutlined aria-hidden />}
          aria-label="Назад"
          onClick={() => formRef.current?.confirmLeave()}
        />
        <h1 className="request-form-page__title">
          {requestId ? 'Редактирование запроса' : 'Новый запрос'}
        </h1>
      </header>
      <div className="request-form-page__body">
        <RequestForm requestId={requestId} ref={formRef} />
      </div>
    </div>
  );
}
