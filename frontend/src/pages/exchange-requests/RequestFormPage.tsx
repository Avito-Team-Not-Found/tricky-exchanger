import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate, useParams } from 'react-router';

import { RequestForm } from '@features/exchange-requests';

import './RequestFormPage.scss';

export function RequestFormPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="request-form-page">
      <header className="request-form-page__header">
        <Button
          className="request-form-page__back"
          type="text"
          icon={<ArrowLeftOutlined aria-hidden />}
          aria-label="Назад"
          onClick={() => navigate('/exchange-requests')}
        />
        <h1 className="request-form-page__title">
          {requestId ? 'Редактирование запроса' : 'Новый запрос'}
        </h1>
      </header>
      <div className="request-form-page__body">
        <RequestForm requestId={requestId} />
      </div>
    </div>
  );
}
