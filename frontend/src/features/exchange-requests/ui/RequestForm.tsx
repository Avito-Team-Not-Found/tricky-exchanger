import { useImperativeHandle, type Ref } from 'react';

import { CheckCircleFilled, LockOutlined, PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Form, Input, Radio, Select, Skeleton } from 'antd';

import { ITEM_STATUS_META } from '@entities/item';

import { categoryOptions } from '@shared/config/categories';
import { ErrorState } from '@shared/ui';

import { useRemoveRequest } from '../model/useRemoveRequest';
import { useRequestForm } from '../model/useRequestForm';

import './RequestForm.scss';

export interface RequestFormHandle {
  confirmLeave: () => void;
}

interface RequestFormProps {
  requestId?: number;
  ref?: Ref<RequestFormHandle>;
}

export function RequestForm({ requestId, ref }: RequestFormProps) {
  const { modal } = AntApp.useApp();
  const {
    form,
    request,
    isEdit,
    isLoading,
    isLoadError,
    submitting,
    canSubmit,
    items,
    readOnly,
    readOnlyReason,
    initialValues,
    result,
    handleValuesChange,
    confirmLeave,
    handleSubmit,
    goToList,
    goToChains,
    goCreateItem,
  } = useRequestForm(requestId);
  const removeRequest = useRemoveRequest(goToList);

  useImperativeHandle(ref, () => ({ confirmLeave }), [confirmLeave]);

  function confirmRemove() {
    // request ещё не загружен — версии нет, удаление слало бы version=0, который
    // бэкенд отклоняет как 422; блокируем, пока форма не получила данные
    if (!request) return;
    modal.confirm({
      title: 'Удалить запрос?',
      content: `Запрос «${request.wantedDescription}» будет отменён и исчезнет из списка.`,
      okText: 'Да, удалить',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () =>
        removeRequest.mutate({ requestId: requestId as number, version: request.version }),
    });
  }

  if (isLoading) {
    return (
      <div className="request-form__skeleton">
        <Skeleton active paragraph={{ rows: 5 }} />
      </div>
    );
  }

  if (isLoadError) {
    return <ErrorState onRetry={() => window.location.reload()} />;
  }

  if (result) {
    const found = result.matching.createdCandidateChains > 0;
    return (
      <div className="request-result">
        <CheckCircleFilled className="request-result__icon" aria-hidden />
        <h2 className="request-result__title">Заявка создана</h2>
        <p className="request-result__description">
          {found
            ? `Найдено ${result.matching.createdCandidateChains} подходящих цепочек. Заявка перешла в статус «В процессе».`
            : 'Пока подходящих цепочек нет — заявка остаётся в поиске.'}
        </p>
        <Button
          className="request-result__cta"
          type="primary"
          size="large"
          block
          onClick={found ? goToChains : goToList}
        >
          {found ? 'Посмотреть цепочки' : 'К моим запросам'}
        </Button>
      </div>
    );
  }

  return (
    <Form
      className="request-form"
      form={form}
      layout="vertical"
      name="request-form"
      initialValues={initialValues}
      disabled={submitting || readOnly}
      onValuesChange={handleValuesChange}
      onFinish={handleSubmit}
    >
      {readOnly && readOnlyReason ? (
        <div className="request-form__lock" role="status">
          <LockOutlined className="request-form__lock-icon" aria-hidden />
          <span>
            {readOnlyReason === 'LOCKED'
              ? 'Заявка заблокирована и защищена от редактирования'
              : 'Эта заявка закрыта для редактирования'}
          </span>
        </div>
      ) : null}

      <section className="request-form__block">
        <h2 className="request-form__heading">Что вы отдаёте?</h2>
        {isEdit ? (
          // деталь заявки не отдаёт снимок товара — берём название из кеша товаров
          <p className="request-form__summary">
            {items.find((item) => item.id === request?.offeredItemId)?.title ?? 'Товар не найден'}
          </p>
        ) : (
          <>
            {items.length > 0 ? (
              <Form.Item
                className="request-form__items-field"
                name="offeredItemId"
                rules={[{ required: true, message: 'Выберите товар' }]}
              >
                <Radio.Group className="request-form__items" orientation="vertical">
                  {items.map((item) => (
                    <Radio
                      key={item.id}
                      value={item.id}
                      disabled={item.status !== 'ACTIVE'}
                      className="request-form__item"
                    >
                      <span className="request-form__item-thumb">
                        {item.imageUrl ? (
                          <img
                            className="request-form__item-image"
                            src={item.imageUrl}
                            alt={item.title}
                          />
                        ) : null}
                      </span>
                      <span className="request-form__item-name">{item.title}</span>
                      {item.status !== 'ACTIVE' ? (
                        <span className="request-form__item-note">
                          {ITEM_STATUS_META[item.status].label}
                        </span>
                      ) : null}
                    </Radio>
                  ))}
                </Radio.Group>
              </Form.Item>
            ) : null}
            <Button icon={<PlusOutlined aria-hidden />} onClick={goCreateItem}>
              Создать новый товар
            </Button>
          </>
        )}
      </section>

      <section className="request-form__block">
        <h2 className="request-form__heading">Что вы хотите получить?</h2>
        <Form.Item
          label="Категория"
          name="wantedCategory"
          rules={[{ required: true, message: 'Выберите категорию' }]}
        >
          <Select
            placeholder="Выберите категорию"
            options={categoryOptions(request?.wantedCategory)}
            showSearch
          />
        </Form.Item>
        <Form.Item
          label="Что вы хотите получить"
          name="wantedDescription"
          rules={[
            { required: true, message: 'Опишите желаемый товар' },
            { max: 500, message: 'Описание не длиннее 500 символов' },
          ]}
        >
          <Input.TextArea
            placeholder="Например, фотоаппарат в рабочем состоянии"
            maxLength={500}
            showCount
            rows={3}
          />
        </Form.Item>
      </section>

      <Button
        className="request-form__submit"
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={submitting}
        disabled={!canSubmit}
      >
        {isEdit ? 'Сохранить запрос' : 'Создать запрос'}
      </Button>
      {isEdit && !readOnly ? (
        <Button
          className="request-form__remove"
          danger
          block
          loading={removeRequest.isPending}
          disabled={submitting}
          onClick={confirmRemove}
        >
          Удалить запрос
        </Button>
      ) : null}
    </Form>
  );
}
