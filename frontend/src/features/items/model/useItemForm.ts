import { useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { App as AntApp, Form, type UploadFile, type UploadProps } from 'antd';
import { useNavigate, useSearchParams } from 'react-router';

import {
  createItem,
  updateItem,
  useItem,
  type Item,
  type ItemCondition,
  type ItemPayload,
} from '@entities/item';

import { getErrorMessage } from '@shared/lib/errorMessage';

type UploadedFile = Parameters<NonNullable<UploadProps['beforeUpload']>>[0];

export interface ItemFormValues {
  title: string;
  description: string;
  condition: ItemCondition;
  color?: string;
  material?: string;
}

export function useItemForm(itemId?: string) {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm<ItemFormValues>();
  const itemQuery = useItem(itemId);
  const item = itemQuery.data;

  const [pendingFile, setPendingFile] = useState<UploadedFile | null>(null);
  const [removingImage, setRemovingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = Boolean(itemId);
  // создание товара из формы запроса: после сохранения возвращаемся в неё с выбором нового товара (PROJECT.md §2.4)
  const returnToRequest = searchParams.get('returnTo') === 'request';
  const isLoading = isEdit && itemQuery.isPending;
  const isLoadError = isEdit && itemQuery.isError;

  // форма монтируется только после загрузки данных (ItemForm рендерит Skeleton), поэтому initialValues достаточно
  const initialValues: Partial<ItemFormValues> | undefined = useMemo(() => {
    if (!item) return undefined;
    return {
      title: item.title,
      description: item.description,
      condition: item.condition,
      color: item.color ?? undefined,
      material: item.material ?? undefined,
    };
  }, [item]);

  // превью фото выводится из состояния, а не копируется в стейт: pending — новое фото, иначе текущее с сервера
  const fileList: UploadFile[] = useMemo(() => {
    if (pendingFile) {
      return [
        { uid: 'pending', name: pendingFile.name, originFileObj: pendingFile, status: 'done' },
      ];
    }
    if (isEdit && item?.image && !removingImage) {
      return [{ uid: 'existing', name: 'Фото', url: item.image, status: 'done' }];
    }
    return [];
  }, [pendingFile, isEdit, item, removingImage]);

  const title = Form.useWatch('title', form);
  const description = Form.useWatch('description', form);
  const condition = Form.useWatch('condition', form);

  const fieldsValid = Boolean(title?.trim()) && Boolean(description?.trim()) && Boolean(condition);
  // фото обязательно только при создании; при редактировании его можно не трогать
  const canSubmit = fieldsValid && (isEdit || fileList.length > 0) && !submitting;

  function handleImageSelected(file: UploadedFile) {
    setPendingFile(file);
    setRemovingImage(false);
  }

  function handleImageRemove() {
    setPendingFile(null);
    if (item?.image) setRemovingImage(true);
  }

  async function handleSubmit(values: ItemFormValues) {
    // повторная отправка при активном запросе недопустима — кнопка блокируется на время сабмита
    if (submitting) return;
    setSubmitting(true);
    const payload: ItemPayload = {
      title: values.title.trim(),
      description: values.description.trim(),
      condition: values.condition,
      color: values.color?.trim() || null,
      material: values.material?.trim() || null,
    };
    try {
      if (isEdit) {
        const image = pendingFile ? pendingFile : removingImage ? null : undefined;
        await updateItem(itemId as string, payload, image);
        message.success('Товар обновлён');
        queryClient.invalidateQueries({ queryKey: ['items'] });
        navigate('/products');
      } else {
        const created = await createItem(payload, pendingFile);
        message.success('Товар создан');
        queryClient.invalidateQueries({ queryKey: ['items'] });
        // форма запроса читает кеш синхронно при монтировании — новый товар должен там уже быть,
        // иначе пресет offeredItemId не применится до фонового refetch
        queryClient.setQueryData<Item[]>(['items'], (old) => (old ? [...old, created] : [created]));
        if (returnToRequest) {
          navigate(`/exchange-requests/new?offeredItemId=${created.id}`);
        } else {
          navigate('/products');
        }
      }
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          { 409: 'Товар уже участвует в сделке' },
          'Не удалось сохранить товар',
        ),
      );
      setSubmitting(false);
    }
  }

  return {
    form,
    item,
    isEdit,
    isLoading,
    isLoadError,
    submitting,
    canSubmit,
    initialValues,
    fileList,
    handleImageSelected,
    handleImageRemove,
    handleSubmit,
  };
}
