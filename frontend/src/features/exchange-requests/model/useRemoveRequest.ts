import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { isAxiosError } from 'axios';

import { removeRequest } from '@entities/exchangeRequest';

import { getErrorMessage } from '@shared/lib/errorMessage';

export interface RemoveRequestInput {
  requestId: number;
  version: number;
}

export function useRemoveRequest(onSuccess?: () => void) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, version }: RemoveRequestInput) => removeRequest(requestId, version),
    onSuccess: () => {
      message.success('Запрос отменён');
      queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
      onSuccess?.();
    },
    onError: (error) => {
      // конфликт версии (409) — заявка успела измениться в другом окне
      if (isAxiosError(error) && error.response?.status === 409) {
        message.error('Заявка изменилась — обновите страницу и попробуйте ещё раз');
        queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
        return;
      }
      message.error(
        getErrorMessage(
          error,
          { 403: 'Нельзя отменить чужую заявку' },
          'Не удалось отменить запрос',
        ),
      );
    },
  });
}
