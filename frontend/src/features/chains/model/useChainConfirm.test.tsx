import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmChain, type ConfirmResult } from '@entities/chain';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useChainConfirm } from './useChainConfirm';

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, confirmChain: vi.fn() };
});

const mockedConfirm = vi.mocked(confirmChain);

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

const PROPOSED: ConfirmResult = { chainId: 1, status: 'PROPOSED' };

describe('useChainConfirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it('opens the decision modal and confirms participation on «Да»', async () => {
    mockedConfirm.mockResolvedValue(PROPOSED);
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    expect(await screen.findByText('Все участники найдены')).toBeInTheDocument();
    expect(screen.getByText('Приступаем к сделке?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Да' }));
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith(1));
  });

  it('keeps the modal open while the request is pending', async () => {
    mockedConfirm.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    expect(mockedConfirm).toHaveBeenCalledWith(1);
    expect(screen.getByText('Все участники найдены')).toBeInTheDocument();
  });

  it('toasts a success while the chain stays proposed', async () => {
    mockedConfirm.mockResolvedValue(PROPOSED);
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    expect(await screen.findByText('Участие подтверждено')).toBeInTheDocument();
  });

  it('toasts a frozen deal separately', async () => {
    mockedConfirm.mockResolvedValue({ chainId: 1, status: 'FROZEN' });
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    expect(await screen.findByText('Сделка подтверждена')).toBeInTheDocument();
  });

  it('invalidates chains and exchange-options after a confirmation', async () => {
    mockedConfirm.mockResolvedValue(PROPOSED);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
      expect(keys).toContainEqual(['chains']);
      expect(keys).toContainEqual(['exchange-options']);
    });
  });

  it('maps the conflict status to an explanatory toast and refreshes data', async () => {
    const refetch = vi.fn();
    mockedConfirm.mockRejectedValue(axiosError(409));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(refetch), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    expect(await screen.findByText('Цепочка изменилась: обновите варианты')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('maps forbidden, not-found and server error statuses', async () => {
    const cases: Array<[number, string]> = [
      [403, 'Вы не участник этой цепочки'],
      [404, 'Цепочка не найдена'],
      [500, 'Не удалось подтвердить участие'],
    ];

    for (const [status, expected] of cases) {
      mockedConfirm.mockRejectedValue(axiosError(status));
      const user = userEvent.setup();
      const { result } = renderHook(() => useChainConfirm(), { wrapper });

      act(() => result.current.openConfirm(1));
      await user.click(await screen.findByRole('button', { name: 'Да' }));

      expect(await screen.findByText(expected)).toBeInTheDocument();
    }
  });

  it('calls onNotFound when the chain has been removed', async () => {
    const onNotFound = vi.fn();
    mockedConfirm.mockRejectedValue(axiosError(404));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(vi.fn(), onNotFound), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    await waitFor(() => expect(onNotFound).toHaveBeenCalled());
  });
});
