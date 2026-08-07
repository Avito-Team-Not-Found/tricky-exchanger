import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCategories } from '@entities/category';
import { createRequest, useRequest, type ExchangeRequest } from '@entities/exchangeRequest';
import { useItems, type Item } from '@entities/item';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useRequestForm } from './useRequestForm';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

vi.mock('@entities/exchangeRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/exchangeRequest')>();
  return {
    ...actual,
    createRequest: vi.fn(),
    updateRequest: vi.fn(),
    useRequest: vi.fn(),
  };
});

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, useItems: vi.fn() };
});

vi.mock('@entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/category')>();
  return { ...actual, useCategories: vi.fn() };
});

const mockedCreateRequest = vi.mocked(createRequest);
const mockedUseRequest = vi.mocked(useRequest);
const mockedUseItems = vi.mocked(useItems);
const mockedUseCategories = vi.mocked(useCategories);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <AntApp>
        <MemoryRouter>{children}</MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const activeItem = {
  id: 'item-1',
  title: 'Комбайн',
  description: 'Мощный',
  categoryId: null,
  condition: 'USED',
  color: null,
  material: null,
  attributes: null,
  image: null,
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
} as Item;

const lockedRequest = {
  id: 'req-1',
  status: 'LOCKED',
  offeredItemId: 'item-1',
  offeredItem: { id: 'item-1', title: 'Комбайн' },
  wantedDescription: 'Ноутбук',
  wantedProfile: null,
} as unknown as ExchangeRequest;

describe('useRequestForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseItems.mockReturnValue(queryOk([activeItem]));
    mockedUseCategories.mockReturnValue(queryOk([{ id: 'electronics', name: 'Электроника' }]));
    mockedUseRequest.mockReturnValue(queryOk(undefined));
  });

  it('creates a request and exposes the matching result', async () => {
    mockedCreateRequest.mockResolvedValue({
      request: { id: 'req-2', status: 'IN_PROPOSAL' } as unknown as ExchangeRequest,
      matching: { createdCandidateChains: 3 },
    });
    const { result } = renderHook(() => useRequestForm(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        offeredItemId: 'item-1',
        wantedDescription: 'Ноутбук',
        categoryId: 'electronics',
        acceptableCondition: ['NEW'],
      });
    });

    expect(mockedCreateRequest).toHaveBeenCalledWith({
      offeredItemId: 'item-1',
      wantedDescription: 'Ноутбук',
      wantedProfile: { categoryId: 'electronics', acceptableCondition: ['NEW'] },
    });
    expect(result.current.result?.matching.createdCandidateChains).toBe(3);
  });

  it('keeps the form read-only for a locked request', () => {
    mockedUseRequest.mockReturnValue(queryOk(lockedRequest));
    const { result } = renderHook(() => useRequestForm('req-1'), { wrapper });

    expect(result.current.readOnly).toBe(true);
    expect(result.current.readOnlyReason).toBe('LOCKED');
    expect(result.current.canSubmit).toBe(false);
  });

  // диалог ухода отправлял значения формы без валидации: незаполненная форма уезжала на сервер
  // (400) или падала на сборке payload, показывая ошибку сети вместо подсказки по полям
  it('does not offer saving an incomplete form on leave', async () => {
    const { result } = renderHook(() => useRequestForm(), { wrapper });

    await act(async () => {
      result.current.handleValuesChange();
    });
    await act(async () => {
      result.current.confirmLeave();
    });

    expect(await screen.findByRole('button', { name: /Выйти без сохранения/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сохранить изменения/ })).not.toBeInTheDocument();
    expect(mockedCreateRequest).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it('detects the missing-items state for a fresh user', () => {
    mockedUseItems.mockReturnValue(queryOk([]));
    const { result } = renderHook(() => useRequestForm(), { wrapper });

    expect(result.current.items).toEqual([]);
  });
});
