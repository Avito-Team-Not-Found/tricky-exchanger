import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createItem, updateItem, useItem, type Item } from '@entities/item';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useItemForm } from './useItemForm';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return {
    ...actual,
    useItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
  };
});

const mockedUseItem = vi.mocked(useItem);
const mockedCreateItem = vi.mocked(createItem);
const mockedUpdateItem = vi.mocked(updateItem);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <AntApp>
        <MemoryRouter>{children}</MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const existingItem = {
  id: 'item-1',
  title: 'Комбайн',
  description: 'Описание',
  condition: 'USED',
  color: 'white',
  material: 'plastic',
  image: 'data:image/png;base64,abc',
} as unknown as Item;

describe('useItemForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseItem.mockReturnValue(queryOk(undefined));
  });

  it('disallows submit on an empty create form', () => {
    const { result } = renderHook(() => useItemForm(), { wrapper });
    expect(result.current.canSubmit).toBe(false);
  });

  it('creates an item with normalized fields', async () => {
    mockedCreateItem.mockResolvedValue(existingItem);
    const { result } = renderHook(() => useItemForm(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        title: '  Смарт-часы  ',
        description: 'Работают',
        condition: 'LIKE_NEW',
        color: '  black ',
        material: '',
      });
    });

    expect(mockedCreateItem).toHaveBeenCalledWith(
      {
        title: 'Смарт-часы',
        description: 'Работают',
        condition: 'LIKE_NEW',
        color: 'black',
        material: null,
      },
      null,
    );
  });

  it('updates an existing item keeping its image', async () => {
    mockedUseItem.mockReturnValue(queryOk(existingItem));
    mockedUpdateItem.mockResolvedValue(existingItem);
    const { result } = renderHook(() => useItemForm('item-1'), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        title: 'Комбайн Bosch',
        description: 'Новое описание',
        condition: 'NEW',
        color: 'red',
        material: 'aluminum',
      });
    });

    // фото не меняли → image === undefined
    expect(mockedUpdateItem).toHaveBeenCalledWith(
      'item-1',
      {
        title: 'Комбайн Bosch',
        description: 'Новое описание',
        condition: 'NEW',
        color: 'red',
        material: 'aluminum',
      },
      undefined,
    );
  });
});
