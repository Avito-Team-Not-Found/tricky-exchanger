import { useImperativeHandle, type Ref } from 'react';

import { DeleteOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Form, Input, Select, Skeleton, Upload } from 'antd';
import { useNavigate } from 'react-router';

import { getItemImageError, ITEM_IMAGE_TYPES } from '@entities/item';

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
  const { message, modal } = AntApp.useApp();
  const archiveItem = useArchiveItem(() => navigate('/products'));
  const {
    form,
    item,
    isEdit,
    isLoading,
    isLoadError,
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
      title: 'Удалить товар?',
      content: `«${item?.title ?? 'Товар'}» будет удалён из списка товаров.`,
      okText: 'Да, удалить',
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
      disabled={submitting}
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
          ) : (
            // без фото сама карточка является триггером загрузки («Добавить фото»)
            <Upload
              className="item-form__photo-upload"
              accept={ITEM_IMAGE_TYPES.join(',')}
              showUploadList={false}
              beforeUpload={(file) => {
                // accept фильтрует диалог выбора, но файл можно притащить drag-and-drop'ом —
                // тип и размер проверяем на месте, чтобы неверный файл не уходил на сервер
                // и не откатывался 422 после успешного сохранения товара
                const imageError = getItemImageError(file);
                if (imageError) {
                  message.error(imageError);
                  return Upload.LIST_IGNORE;
                }
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
          {hasPhoto ? (
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
      {isEdit ? (
        <Button
          className="item-form__archive"
          danger
          block
          loading={archiveItem.isPending}
          disabled={submitting}
          onClick={confirmArchive}
        >
          Удалить товар
        </Button>
      ) : null}
    </Form>
  );
}
