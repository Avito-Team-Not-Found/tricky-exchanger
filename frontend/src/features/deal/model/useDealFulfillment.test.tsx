import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmHandoff, confirmReceipt, type Chain } from '@entities/chain';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useDealFulfillment } from './useDealFulfillment';

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, confirmHandoff: vi.fn(), confirmReceipt: vi.fn() };
});

const mockedHandoff = vi.mocked(confirmHandoff);
const mockedReceipt = vi.mocked(confirmReceipt);

let queryClient = createTestQueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AntApp>{children}</AntApp>
    </QueryClientProvider>
  );
}

function axiosError(status: number) {
  const error = new AxiosError('request failed');
  Object.assign(error, { response: { status } });
  return error;
}

function makeChain(): Chain {
  return {
    id: 1,
    status: 'FROZEN',
    score: 0.9,
    length: 2,
    version: 1,
    currentRequestId: 101,
    currentPosition: 1,
    givesToPosition: 0,
    receivesFromPosition: 2,
    createdAt: '',
    updatedAt: '',
    participants: [
      {
        clusterId: 1,
        requestId: 101,
        position: 1,
        isCurrentUser: true,
        offeredItemId: 1,
        offeredItemTitle: 'Мой товар',
        offeredItemDescription: '',
        wantedDescription: 'Хочу их товар',
        requestStatus: 'LOCKED',
      },
      {
        clusterId: 2,
        requestId: 202,
        position: 2,
        isCurrentUser: false,
        offeredItemId: 2,
        offeredItemTitle: 'Их товар',
        offeredItemDescription: '',
        wantedDescription: 'Хочу мой товар',
        requestStatus: 'LOCKED',
      },
    ],
  };
}

describe('useDealFulfillment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it('confirms the handoff with my request id without a confirm modal', async () => {
    mockedHandoff.mockResolvedValue({ chainId: 1, requestId: 101, status: 'IN_PROGRESS' });
    const { result } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

    await act(async () => {
      await result.current.confirmHandoff();
    });

    expect(mockedHandoff).toHaveBeenCalledWith(1, 101);
    // подтверждением отправки служит фото упаковки — модалку не показываем
    expect(screen.queryByText('Отправить товар?')).not.toBeInTheDocument();
  });

  it('confirms the receipt with the source request id without a confirm modal', async () => {
    mockedReceipt.mockResolvedValue({ chainId: 1, requestId: 202, status: 'IN_PROGRESS' });
    const { result } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

    await act(async () => {
      await result.current.confirmReceipt();
    });

    expect(mockedReceipt).toHaveBeenCalledWith(1, 202);
    expect(screen.queryByText('Забрать товар?')).not.toBeInTheDocument();
  });

  it('toasts handoff success and invalidates the deal-related keys', async () => {
    mockedHandoff.mockResolvedValue({ chainId: 1, requestId: 101, status: 'IN_PROGRESS' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

    await act(async () => {
      await result.current.confirmHandoff();
    });

    expect(await screen.findByText('Отправка подтверждена')).toBeInTheDocument();
    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
      expect(keys).toContainEqual(['chains']);
      expect(keys).toContainEqual(['exchange-options']);
      expect(keys).toContainEqual(['exchange-requests']);
    });
  });

  it('does not open a modal after a receipt — the screen shows the result', async () => {
    mockedReceipt.mockResolvedValue({ chainId: 1, requestId: 202, status: 'IN_PROGRESS' });
    const { result } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

    await act(async () => {
      await result.current.confirmReceipt();
    });

    // подтверждение получения не дублируется модалкой: после инвалидации экран перейдёт в «Вы забрали товар»
    expect(screen.queryByText('Получение подтверждено')).not.toBeInTheDocument();
  });

  it('toasts a completed deal without a received modal', async () => {
    mockedReceipt.mockResolvedValue({ chainId: 1, requestId: 202, status: 'COMPLETED' });
    const { result } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

    await act(async () => {
      await result.current.confirmReceipt();
    });

    expect(await screen.findByText('Обмен завершён')).toBeInTheDocument();
    expect(screen.queryByText('Получение подтверждено')).not.toBeInTheDocument();
  });

  it('maps the pending handoff conflict to its own toast', async () => {
    mockedHandoff.mockRejectedValue(axiosError(409));
    const { result } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

    await act(async () => {
      await result.current.confirmHandoff();
    });

    expect(await screen.findByText('Цепочка ещё не готова к передаче товаров')).toBeInTheDocument();
  });

  it('maps the pending receipt conflict to its own toast', async () => {
    mockedReceipt.mockRejectedValue(axiosError(409));
    const { result } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

    await act(async () => {
      await result.current.confirmReceipt();
    });

    expect(await screen.findByText('Передача товара ещё не подтверждена')).toBeInTheDocument();
  });

  it('maps receipt-only statuses like 403 and 422', async () => {
    const cases: Array<[number, string]> = [
      [403, 'Только получатель товара может подтвердить получение'],
      [422, 'Заявка не является закреплённым товаром этой цепочки'],
    ];

    for (const [status, expected] of cases) {
      mockedReceipt.mockRejectedValue(axiosError(status));
      const { result, unmount } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

      await act(async () => {
        await result.current.confirmReceipt();
      });

      expect(await screen.findByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it('falls back to a generic toast for unknown failures', async () => {
    mockedReceipt.mockRejectedValue(axiosError(500));
    const { result } = renderHook(() => useDealFulfillment(makeChain()), { wrapper });

    await act(async () => {
      await result.current.confirmReceipt();
    });

    expect(await screen.findByText('Не удалось подтвердить операцию')).toBeInTheDocument();
  });
});
