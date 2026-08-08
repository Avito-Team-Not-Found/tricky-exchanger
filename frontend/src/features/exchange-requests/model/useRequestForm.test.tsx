import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const mockedCreateRequest = vi.mocked(createRequest);
const mockedUseRequest = vi.mocked(useRequest);
const mockedUseItems = vi.mocked(useItems);

// wrapper замыкает module-скоп queryClient — пересоздаём его в beforeEach, чтобы кеш и спайки
// не текли между тестами (и можно было спаять инвалидацию на текущем инстансе)
let queryClient = createTestQueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter>{children}</MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const activeItem = {
  id: 1,
  title: 'Комбайн',
  description: 'Мощный',
  categoryId: null,
  imageUrl: null,
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
} as Item;

const editableRequest = {
  id: 1,
  status: 'IN_PROPOSAL',
  offeredItemId: 1,
  offeredItemTitle: 'Комбайн',
  wantedDescription: 'Ноутбук',
  version: 1,
} as unknown as ExchangeRequest;

const lockedRequest = {
  id: 1,
  status: 'LOCKED',
  offeredItemId: 1,
  offeredItemTitle: 'Комбайн',
  wantedDescription: 'Ноутбук',
  version: 1,
} as unknown as ExchangeRequest;

describe('useRequestForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
    mockedUseItems.mockReturnValue(queryOk({ items: [activeItem], total: 1 }));
    mockedUseRequest.mockReturnValue(queryOk(undefined));
  });

  it('creates a request and exposes the result with zero candidate chains', async () => {
    // матчинг на бэкенде — заглушка, цепочки выключены флагом: createRequest возвращает
    // только объект заявки, а не {request, matching} как мок (SCRUM-50 §5)
    mockedCreateRequest.mockResolvedValue({
      id: 2,
      status: 'IN_PROPOSAL',
      offeredItemId: 1,
      offeredItemTitle: 'Комбайн',
      wantedDescription: 'Ноутбук',
      version: 1,
      createdAt: '',
      updatedAt: '',
    } as ExchangeRequest);
    const { result } = renderHook(() => useRequestForm(), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        offeredItemId: 1,
        wantedDescription: 'Ноутбук',
      });
    });

    expect(mockedCreateRequest).toHaveBeenCalledWith({
      offeredItemId: 1,
      wantedDescription: 'Ноутбук',
    });
    expect(result.current.result?.request.id).toBe(2);
    expect(result.current.result?.matching.createdCandidateChains).toBe(0);
  });

  it('keeps the form read-only for a locked request', () => {
    mockedUseRequest.mockReturnValue(queryOk(lockedRequest));
    const { result } = renderHook(() => useRequestForm(1), { wrapper });

    expect(result.current.readOnly).toBe(true);
    expect(result.current.readOnlyReason).toBe('LOCKED');
    expect(result.current.canSubmit).toBe(false);
  });

  // правка заявки пересчитывает цепочки на сервере: кроме списка заявок нужно
  // инвалидировать и кеш цепочек — иначе «Варианты обмена» ещё минуту держат старые
  it('invalidates exchange requests and chains after an update', async () => {
    mockedUseRequest.mockReturnValue(queryOk(editableRequest));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRequestForm(1), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        offeredItemId: 1,
        wantedDescription: 'Фотоаппарат',
      });
    });

    const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
    expect(keys).toContainEqual(['exchange-requests']);
    expect(keys).toContainEqual(['chains']);
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
    mockedUseItems.mockReturnValue(queryOk({ items: [], total: 0 }));
    const { result } = renderHook(() => useRequestForm(), { wrapper });

    expect(result.current.items).toEqual([]);
  });

  // ранний выход до отправки (кеш заявки опустел) не должен навсегда блокировать форму
  it('resets submitting when the edited request disappears from the cache', async () => {
    const { result } = renderHook(() => useRequestForm(1), { wrapper });

    await act(async () => {
      await result.current.handleSubmit({
        offeredItemId: 1,
        wantedDescription: 'Фотоаппарат',
      });
    });

    expect(result.current.submitting).toBe(false);
  });
});
