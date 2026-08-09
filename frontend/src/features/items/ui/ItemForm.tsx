import { useImperativeHandle, type Ref } from 'react';

import { DeleteOutlined, LockOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Form, Input, Select, Skeleton, Upload } from 'antd';
import { useNavigate } from 'react-router';

import { categoryOptions, DESCRIPTION_MIN_LENGTH } from '@shared/config/categories';
import { ErrorState } from '@shared/ui';

import { useArchiveItem } from '../model/useArchiveItem';
import { useItemForm } from '../model/useItemForm';

import './ItemForm.scss';

export interface ItemFormHandle {
  confirmLeave: () => void;
}

interface ItemFormProps {
  itemId?: number;
  ref?: Ref<ItemFormHandle>;
}

export function ItemForm({ itemId, ref }: ItemFormProps) {
  const navigate = useNavigate();
  const { modal } = AntApp.useApp();
  const archiveItem = useArchiveItem(() => navigate('/products'));
  const {
    form,
    item,
    isEdit,
    isLoading,
    isLoadError,
    readOnly,
    submitting,
    canSubmit,
    initialValues,
    previewUrl,
    hasPhoto,
    handleImageSelected,
    handleImageRemove,
    handleValuesChange,
    confirmLeave,
    handleSubmit,
  } = useItemForm(itemId);

  useImperativeHandle(ref, () => ({ confirmLeave }), [confirmLeave]);

  if (isLoading) {
    return (
      <div className="item-form__skeleton">
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  if (isLoadError) {
    return <ErrorState onRetry={() => window.location.reload()} />;
  }

  function confirmArchive() {
    modal.confirm({
      title: 'Отправить в архив?',
      content: `«${item?.title ?? 'Товар'}» останется в списке с пометкой «В архиве».`,
      okText: 'В архив',
      okButtonProps: { danger: true },
      cancelText: 'Отмена',
      onOk: () => archiveItem.mutate(itemId as number),
    });
  }

  return (
    <Form
      className="item-form"
      form={form}
      layout="vertical"
      name="item-form"
      initialValues={initialValues}
      disabled={submitting || readOnly}
      onValuesChange={handleValuesChange}
      onFinish={handleSubmit}
    >
      <Form.Item label="Фото" required>
        <div className="item-form__photo">
          {hasPhoto ? (
            <div className="item-form__photo-preview item-form__photo-preview--filled">
              {previewUrl ? (
                <img className="item-form__photo-image" src={previewUrl} alt="Фото товара" />
              ) : (
                // файл выбран, но превью недоступно (окружение без Object URL API) —
                // заглушка вместо <img> без src, который рисуется битой картинкой
                <>
                  <PictureOutlined className="item-form__photo-add-icon" aria-hidden />
                  <span className="item-form__photo-add">Фото выбрано</span>
                </>
              )}
            </div>
          ) : readOnly ? (
            // у архивного товара загрузка фото недоступна — пустая область без триггера
            <div className="item-form__photo-preview item-form__photo-preview--empty" aria-hidden>
              <PictureOutlined className="item-form__photo-add-icon" aria-hidden />
              <span className="item-form__photo-add">Фото не добавлено</span>
            </div>
          ) : (
            // без фото сама карточка является триггером загрузки («Добавить фото»)
            <Upload
              className="item-form__photo-upload"
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                handleImageSelected(file);
                return Upload.LIST_IGNORE;
              }}
            >
              <div className="item-form__photo-preview item-form__photo-preview--empty">
                <UploadOutlined className="item-form__photo-add-icon" aria-hidden />
                <span className="item-form__photo-add">Добавить фото</span>
              </div>
            </Upload>
          )}
          {hasPhoto && !readOnly ? (
            <Button
              className="item-form__photo-remove"
              type="text"
              danger
              icon={<DeleteOutlined aria-hidden />}
              onClick={handleImageRemove}
            >
              Удалить фото
            </Button>
          ) : null}
        </div>
      </Form.Item>
      <Form.Item
        label="Название"
        name="title"
        rules={[
          { required: true, message: 'Введите название' },
          { max: 100, message: 'Название не длиннее 100 символов' },
        ]}
      >
        <Input placeholder="Название товара" maxLength={100} showCount />
      </Form.Item>
      {/* выбор только из справочника: кластеризация сравнивает категорию точным строковым
          равенством, поэтому произвольный текст увёл бы заявку в пул из одного себя */}
      <Form.Item
        label="Категория"
        name="category"
        rules={[{ required: true, message: 'Выберите категорию' }]}
      >
        <Select
          placeholder="Выберите категорию"
          options={categoryOptions(item?.category)}
          showSearch
        />
      </Form.Item>
      <Form.Item
        label="Описание"
        name="description"
        rules={[
          { required: true, message: 'Введите описание' },
          { max: 500, message: 'Описание не длиннее 500 символов' },
          {
            // кастомный validator вместо min: antd считает символы до обрезки, а на бэкенд
            // уходит values.description.trim() — 50 пробелов прошли бы через min
            validator(_, value: string | undefined) {
              if (!value || value.trim().length >= DESCRIPTION_MIN_LENGTH) {
                return Promise.resolve();
              }
              return Promise.reject(new Error('Пожалуйста, опишите товар подробнее'));
            },
          },
        ]}
      >
        <Input.TextArea placeholder="Описание товара" maxLength={500} showCount rows={4} />
      </Form.Item>
      {readOnly ? (
        <div className="item-form__archived" role="status">
          <LockOutlined className="item-form__archived-icon" aria-hidden />
          Товар в архиве — редактирование недоступно
        </div>
      ) : (
        <Button
          className="item-form__submit"
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={submitting}
          disabled={!canSubmit}
        >
          {isEdit ? 'Сохранить изменения' : 'Сохранить'}
        </Button>
      )}
      {isEdit && !readOnly ? (
        <Button
          className="item-form__archive"
          danger
          block
          loading={archiveItem.isPending}
          disabled={submitting}
          onClick={confirmArchive}
        >
          В архив
        </Button>
      ) : null}
    </Form>
  );
}
