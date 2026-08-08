import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { App as AntApp, Form } from 'antd';
import { isAxiosError } from 'axios';
import { useNavigate, useSearchParams } from 'react-router';

import {
  createRequest,
  isRequestEditable,
  updateRequest,
  useRequest,
  type CreateRequestResult,
} from '@entities/exchangeRequest';
import { useItems } from '@entities/item';

import { getErrorMessage } from '@shared/lib/errorMessage';

export interface RequestFormValues {
  offeredItemId: number;
  wantedDescription: string;
  wantedCategory?: string;
}

export function useRequestForm(requestId?: number) {
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm<RequestFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateRequestResult | null>(null);
  const [dirty, setDirty] = useState(false);

  const requestQuery = useRequest(requestId);
  const request = requestQuery.data;
  const itemsQuery = useItems();

  const isEdit = Boolean(requestId);
  const items = itemsQuery.data?.items ?? [];
  const readOnly = isEdit && request ? !isRequestEditable(request.status) : false;
  const readOnlyReason = readOnly && request ? request.status : null;
  const isLoading = isEdit ? requestQuery.isPending : itemsQuery.isPending;
  const isLoadError = isEdit ? requestQuery.isError : itemsQuery.isError;

  // пресет выбранного товара при возврате из формы создания товара (PROJECT.md §2.4)
  const preselectedItemId = searchParams.get('offeredItemId');

  // форма монтируется только после загрузки данных (RequestForm рендерит Skeleton),
  // поэтому префоллы задаются через initialValues, а не setState в эффекте
  const initialValues: Partial<RequestFormValues> | undefined = isEdit
    ? request
      ? {
          offeredItemId: request.offeredItemId,
          wantedDescription: request.wantedDescription,
          // пустую категорию не подставляем: Select с value='' рисует пустой чип вместо placeholder'а
          wantedCategory: request.wantedCategory || undefined,
        }
      : undefined
    : {
        offeredItemId:
          preselectedItemId &&
          items.some((item) => item.id === Number(preselectedItemId) && item.status === 'ACTIVE')
            ? Number(preselectedItemId)
            : undefined,
      };

  const offeredItemId = Form.useWatch('offeredItemId', form);
  const wantedDescription = Form.useWatch('wantedDescription', form);
  const wantedCategory = Form.useWatch('wantedCategory', form);

  const canSubmit =
    Boolean(wantedDescription?.trim()) &&
    Boolean(wantedCategory) &&
    (isEdit || Boolean(offeredItemId)) &&
    !submitting &&
    !readOnly;

  async function handleSubmit(values: RequestFormValues) {
    // повторная отправка при активном запросе недопустима — кнопка блокируется на время сабмита
    if (submitting) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        if (!request) return;
        await updateRequest(requestId as number, {
          offeredItemId: request.offeredItemId,
          wantedDescription: values.wantedDescription.trim(),
          // поле обязательное; ?? '' — страховка, PUT перезаписывает заявку целиком
          wantedCategory: values.wantedCategory ?? '',
          version: request.version,
        });
        message.success('Запрос обновлён');
        queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
        // правка заявки пересчитывает кандидатные цепочки на сервере — иначе список
        // вариантов ещё минуту показывает старые цепочки (кеш 'chains' живёт 60 с)
        queryClient.invalidateQueries({ queryKey: ['chains'] });
        navigate('/exchange-requests');
      } else {
        const created = await createRequest({
          offeredItemId: values.offeredItemId,
          wantedDescription: values.wantedDescription.trim(),
          wantedCategory: values.wantedCategory ?? '',
        });
        // матчинг на бэкенде — заглушка (SCRUM-50 §5), цепочки на фронте выключены флагом
        setResult({ request: created, matching: { createdCandidateChains: 0 } });
        queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
      }
      // после успешного сохранения уход с формы не должен спрашивать про несохранённое
      setDirty(false);
    } catch (error) {
      // конфликт версии (409) — заявка успела измениться в другом окне; кеш устарел, а не форма
      if (isEdit && isAxiosError(error) && error.response?.status === 409) {
        message.error('Заявка изменилась — обновите страницу и попробуйте ещё раз');
        queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
        return;
      }
      message.error(
        getErrorMessage(
          error,
          { 400: 'Проверьте заполнение полей', 409: 'Товар уже в резерве' },
          'Не удалось сохранить запрос',
        ),
      );
    } finally {
      // в том числе при раннем выходе до отправки (кеш заявки опустел) — иначе форма
      // навсегда остаётся заблокированной (disabled={submitting || readOnly})
      setSubmitting(false);
    }
  }

  function goToList() {
    navigate('/exchange-requests');
  }

  // после создания с найденными цепочками ведём на экран «Варианты обмена» (PROJECT.md §2.6)
  function goToChains() {
    if (!result) return;
    navigate(`/exchange-requests/${result.request.id}`);
  }

  // у пользователя нет товаров — ведём в форму создания товара, оттуда вернёмся с выбором нового (PROJECT.md §2.4)
  function goCreateItem() {
    navigate('/products/new?returnTo=request');
  }

  function handleValuesChange() {
    setDirty(true);
  }

  function confirmLeave() {
    if (!dirty) {
      goToList();
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
        onOk: () => goToList(),
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
        handleSubmit(form.getFieldsValue() as RequestFormValues);
      },
      onCancel: () => goToList(),
    });
  }

  return {
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
  };
}
