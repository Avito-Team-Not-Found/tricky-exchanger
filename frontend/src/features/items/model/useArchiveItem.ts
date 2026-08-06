import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';

import { archiveItem } from '@entities/item';

import { getErrorMessage } from '@shared/lib/errorMessage';

export function useArchiveItem(onSuccess?: () => void) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => archiveItem(itemId),
    onSuccess: () => {
      message.success('Товар удалён');
      queryClient.invalidateQueries({ queryKey: ['items'] });
      onSuccess?.();
    },
    onError: (error) =>
      message.error(
        getErrorMessage(error, { 409: 'Товар уже участвует в сделке' }, 'Не удалось удалить товар'),
      ),
  });
}
