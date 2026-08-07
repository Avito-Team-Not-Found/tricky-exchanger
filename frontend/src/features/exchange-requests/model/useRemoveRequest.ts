import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';

import { removeRequest } from '@entities/exchangeRequest';

import { getErrorMessage } from '@shared/lib/errorMessage';

export function useRemoveRequest(onSuccess?: () => void) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => removeRequest(requestId),
    onSuccess: () => {
      message.success('Запрос отменён');
      queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
      onSuccess?.();
    },
    onError: (error) =>
      message.error(
        getErrorMessage(
          error,
          { 409: 'Запрос уже участвует в сделке' },
          'Не удалось отменить запрос',
        ),
      ),
  });
}
