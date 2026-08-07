import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { archiveItem } from '@entities/item';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useArchiveItem } from './useArchiveItem';

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, archiveItem: vi.fn() };
});

const mockedArchiveItem = vi.mocked(archiveItem);

let queryClient = createTestQueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AntApp>{children}</AntApp>
    </QueryClientProvider>
  );
}

describe('useArchiveItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  // сервер удаляет вместе с товаром и его заявки, поэтому их список тоже надо инвалидировать:
  // иначе удалённая заявка ещё минуту висит в кеше и клик по ней уводит в 404
  it('invalidates both items and exchange requests', async () => {
    mockedArchiveItem.mockResolvedValue(undefined);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useArchiveItem(), { wrapper });

    await act(async () => {
      result.current.mutate('item-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
    expect(keys).toContainEqual(['items']);
    expect(keys).toContainEqual(['exchange-requests']);
  });

  it('calls onSuccess after a successful archive', async () => {
    mockedArchiveItem.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useArchiveItem(onSuccess), { wrapper });

    await act(async () => {
      result.current.mutate('item-1');
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });
});
