import { useEffect, useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { App as AntApp, Form, type UploadProps } from 'antd';
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
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm<ItemFormValues>();
  const itemQuery = useItem(itemId);
  const item = itemQuery.data;

  const [pendingFile, setPendingFile] = useState<UploadedFile | null>(null);
  const [removingImage, setRemovingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);

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

  // фото обязательно в обеих формах: убрали фотку у существующего товара — сохранить нельзя
  const hasPhoto = Boolean(pendingFile) || (isEdit && Boolean(item?.image) && !removingImage);

  // blob-URL под выбранный файл живёт ровно до смены файла или размонтирования,
  // иначе каждая новая фотка (до 5 МБ) остаётся висеть в памяти вкладки
  const pendingPreview = useMemo(
    () =>
      pendingFile && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(pendingFile)
        : null,
    [pendingFile],
  );
  useEffect(() => {
    if (!pendingPreview) return;
    return () => URL.revokeObjectURL(pendingPreview);
  }, [pendingPreview]);

  // выбран новый файл — показываем только его (даже если превью ещё не готово),
  // иначе — текущее фото с сервера. Показывать старое фото вместо нового нельзя: это враньё
  const previewUrl = pendingFile
    ? pendingPreview
    : isEdit && item?.image && !removingImage
      ? item.image
      : null;

  const title = Form.useWatch('title', form);
  const description = Form.useWatch('description', form);
  const condition = Form.useWatch('condition', form);

  const fieldsValid = Boolean(title?.trim()) && Boolean(description?.trim()) && Boolean(condition);
  const canSubmit = fieldsValid && hasPhoto && !submitting;

  function handleImageSelected(file: UploadedFile) {
    setPendingFile(file);
    setRemovingImage(false);
    setDirty(true);
  }

  function handleImageRemove() {
    setPendingFile(null);
    if (item?.image) setRemovingImage(true);
    setDirty(true);
  }

  // любой ввод в поля формы помечает её как изменённую
  function handleValuesChange() {
    setDirty(true);
  }

  function goBack() {
    navigate(returnToRequest ? '/exchange-requests/new' : '/products');
  }

  // уход с формы с несохранёнными изменениями — только через подтверждение
  function confirmLeave() {
    if (!dirty) {
      goBack();
      return;
    }
    modal.confirm({
      title: 'Изменения не сохранены',
      content: 'Хотите сохранить изменения или вернуться назад?',
      okText: 'Сохранить изменения',
      cancelText: 'Назад',
      closable: false,
      maskClosable: false,
      // form.submit()/validateFields() из колбэка модалки не завершаются в этом контексте —
      // берём значения синхронно и шлём сами (валидация формы уже ограничивает кнопку сохранения)
      // form.submit()/validateFields() из колбэка модалки не завершаются в этом контексте —
      // берём значения синхронно и шлём сами (валидация формы уже ограничивает кнопку сохранения)
      onOk: () => {
        handleSubmit(form.getFieldsValue() as ItemFormValues);
      },
      onCancel: () => goBack(),
    });
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
        await updateItem(itemId as string, payload, pendingFile ?? undefined);
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
    previewUrl,
    hasPhoto,
    handleImageSelected,
    handleImageRemove,
    handleValuesChange,
    confirmLeave,
    handleSubmit,
  };
}
