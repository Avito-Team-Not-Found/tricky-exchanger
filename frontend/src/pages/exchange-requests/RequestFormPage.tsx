import { useRef } from 'react';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { RequestForm, type RequestFormHandle } from '@features/exchange-requests';

import { ErrorState } from '@shared/ui';

import './RequestFormPage.scss';

export function RequestFormPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const formRef = useRef<RequestFormHandle>(null);

  const numericRequestId = requestId ? Number(requestId) : undefined;

  // нечисловой id из адресной строки (рукописная ссылка) — некорректный URL,
  // форму редактирования не открываем, ведём в список, где можно выбрать валидный запрос
  if (requestId && !Number.isInteger(numericRequestId)) {
    return (
      <div className="request-form-page">
        <div className="request-form-page__body">
          <ErrorState onRetry={() => navigate('/exchange-requests')} />
        </div>
      </div>
    );
  }

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
        <RequestForm requestId={numericRequestId} ref={formRef} />
      </div>
    </div>
  );
}
