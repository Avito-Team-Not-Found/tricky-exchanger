import { useImperativeHandle, type Ref } from 'react';

import { DeleteOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Form, Input, Select, Skeleton, Upload } from 'antd';
import { useNavigate } from 'react-router';

import { ITEM_CONDITIONS } from '@entities/item';

import { ErrorState } from '@shared/ui';

import { useArchiveItem } from '../model/useArchiveItem';
import { useItemForm } from '../model/useItemForm';

import './ItemForm.scss';

const CONDITION_OPTIONS = ITEM_CONDITIONS.map(({ value, label }) => ({ value, label }));

export interface ItemFormHandle {
  confirmLeave: () => void;
}

interface ItemFormProps {
  itemId?: string;
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
      onOk: () => archiveItem.mutate(itemId as string),
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
      <Form.Item
        label="Описание"
        name="description"
        rules={[
          { required: true, message: 'Введите описание' },
          { max: 500, message: 'Описание не длиннее 500 символов' },
        ]}
      >
        <Input.TextArea placeholder="Описание товара" maxLength={500} showCount rows={4} />
      </Form.Item>
      <Form.Item
        label="Состояние"
        name="condition"
        rules={[{ required: true, message: 'Выберите состояние' }]}
      >
        <Select placeholder="Выберите состояние" options={CONDITION_OPTIONS} />
      </Form.Item>
      <Form.Item label="Цвет" name="color">
        <Input placeholder="Например, белый" maxLength={50} />
      </Form.Item>
      <Form.Item label="Материал" name="material">
        <Input placeholder="Например, пластик" maxLength={50} />
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
