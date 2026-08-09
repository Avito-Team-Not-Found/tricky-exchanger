import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';

import { archiveItem } from '@entities/item';

import { getErrorMessage } from '@shared/lib/errorMessage';

export function useArchiveItem(onSuccess?: () => void) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) => archiveItem(itemId),
    onSuccess: () => {
      message.success('Товар в архиве');
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['items-page'] });
      // вместе с товаром сервер удаляет и связанные с ним заявки — иначе их список
      // остаётся в кеше stale (staleTime 60s) и клик по удалённой заявке уводит в 404
      queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
      onSuccess?.();
    },
    onError: (error) =>
      message.error(
        getErrorMessage(
          error,
          { 409: 'Товар уже участвует в сделке' },
          'Не удалось отправить товар в архив',
        ),
      ),
  });
}
