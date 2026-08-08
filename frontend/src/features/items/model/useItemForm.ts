import { useEffect, useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { App as AntApp, Form, type UploadProps } from 'antd';
import { useNavigate, useSearchParams } from 'react-router';

import {
  createItem,
  ItemImageUploadError,
  updateItem,
  useItem,
  type ItemPayload,
  type ItemsList,
} from '@entities/item';

import { getErrorMessage } from '@shared/lib/errorMessage';

type UploadedFile = Parameters<NonNullable<UploadProps['beforeUpload']>>[0];

export interface ItemFormValues {
  title: string;
  description: string;
  category?: string;
}

export function useItemForm(itemId?: number) {
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
      // пустая категория (товар старше миграции) не должна выглядеть как выбранная —
      // Select с value='' рисует пустой чип вместо placeholder'а
      category: item.category || undefined,
    };
  }, [item]);

  // фото обязательно в обеих формах: убрали фотку у существующего товара — сохранить нельзя
  const hasPhoto = Boolean(pendingFile) || (isEdit && Boolean(item?.imageUrl) && !removingImage);

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
    : isEdit && item?.imageUrl && !removingImage
      ? item.imageUrl
      : null;

  const title = Form.useWatch('title', form);
  const description = Form.useWatch('description', form);
  const category = Form.useWatch('category', form);

  const fieldsValid = Boolean(title?.trim()) && Boolean(description?.trim()) && Boolean(category);
  const canSubmit = fieldsValid && hasPhoto && !submitting;

  function handleImageSelected(file: UploadedFile) {
    setPendingFile(file);
    setRemovingImage(false);
    setDirty(true);
  }

  function handleImageRemove() {
    setPendingFile(null);
    if (item?.imageUrl) setRemovingImage(true);
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
    // форма заполнена не полностью — сохранять нечего, предлагаем только уйти или остаться
    if (!canSubmit) {
      modal.confirm({
        title: 'Изменения не сохранены',
        content: 'Форма заполнена не полностью — сохранить нельзя. Выйти без сохранения?',
        okText: 'Выйти без сохранения',
        okButtonProps: { danger: true },
        cancelText: 'Остаться',
        closable: false,
        maskClosable: false,
        onOk: () => goBack(),
      });
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
      // берём значения синхронно и шлём сами (сюда попадаем только при canSubmit)
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
    try {
      const payload: ItemPayload = {
        title: values.title.trim(),
        description: values.description.trim(),
        // поле обязательное, до сабмита пустым не доходит; ?? '' — страховка от PATCH
        // без ключа, который оставил бы на сервере прежнее значение
        category: values.category ?? '',
      };
      if (isEdit) {
        await updateItem(itemId as number, payload, pendingFile ?? undefined);
        message.success('Товар обновлён');
        queryClient.invalidateQueries({ queryKey: ['items'] });
        // карточки заявок показывают название отдаваемого товара (offeredItemTitle) —
        // без инвалидации список заявок ещё минуту показывает старое название
        queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
        // правка после «создать товар из формы запроса» (PROJECT.md §2.4): сохранение
        // фото возвращает в форму запроса с выбором этого товара, а не в список товаров
        navigate(returnToRequest ? `/exchange-requests/new?offeredItemId=${itemId}` : '/products');
      } else {
        const created = await createItem(payload, pendingFile);
        message.success('Товар создан');
        queryClient.invalidateQueries({ queryKey: ['items'] });
        // форма запроса читает кеш синхронно при монтировании — новый товар должен там уже быть,
        // иначе пресет offeredItemId не применится до фонового refetch
        queryClient.setQueryData<ItemsList>(['items'], (old) => ({
          items: old ? [...old.items, created] : [created],
          total: (old?.total ?? 0) + 1,
        }));
        if (returnToRequest) {
          navigate(`/exchange-requests/new?offeredItemId=${created.id}`);
        } else {
          navigate('/products');
        }
      }
    } catch (error) {
      // товар уже сохранён, но фото не загрузилось — не теряем изменения, возвращаемся к форме
      if (error instanceof ItemImageUploadError) {
        message.error(
          isEdit
            ? 'Товар обновлён, но фото не загрузилось — попробуйте загрузить его ещё раз'
            : 'Товар создан, но фото не загрузилось. Добавьте его на экране редактирования',
        );
        // товар создан/обновлён на сервере, но клиентский список его ещё не знает —
        // иначе /products ещё 60 с отдаёт кеш без изменений
        queryClient.invalidateQueries({ queryKey: ['items'] });
        // название товара уже могло поменяться — карточки заявок (offeredItemTitle)
        // иначе ещё минуту показывают старый текст
        queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
        if (!isEdit) {
          // возврат в форму запроса сохраняется (PROJECT.md §2.4): после дозагрузки фото
          // пользователь снова попадёт в форму запроса с выбором созданного товара
          navigate(
            returnToRequest
              ? `/products/${error.item.id}/edit?returnTo=request`
              : `/products/${error.item.id}/edit`,
          );
          return;
        }
        setSubmitting(false);
        return;
      }
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
