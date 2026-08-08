import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { voteForRequest, withdrawVote, type ChainVoteResult } from '@entities/chain';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useChainVote } from './useChainVote';

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, voteForRequest: vi.fn(), withdrawVote: vi.fn() };
});

const mockedVote = vi.mocked(voteForRequest);
const mockedWithdraw = vi.mocked(withdrawVote);

let queryClient = createTestQueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AntApp>{children}</AntApp>
    </QueryClientProvider>
  );
}

const TARGET = { chainId: 1, requestId: 101, targetRequestId: 202 };
const VOTED: ChainVoteResult = {
  chainId: 1,
  requestId: 101,
  targetRequestId: 202,
  vote: 'pending',
  votedAt: '2026-08-08T12:00:00Z',
  chainStatus: 'CANDIDATE',
};

function axiosError(status: number) {
  const error = new AxiosError('request failed');
  Object.assign(error, { response: { status } });
  return error;
}

describe('useChainVote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it('casts a vote without a confirmation modal', async () => {
    mockedVote.mockResolvedValue(VOTED);
    const { result } = renderHook(() => useChainVote(), { wrapper });

    await act(async () => {
      result.current.confirmVote(TARGET, true);
    });

    await waitFor(() =>
      expect(mockedVote).toHaveBeenCalledWith(1, { requestId: 101, targetRequestId: 202 }),
    );
  });

  it('confirms withdrawing a vote through the modal', async () => {
    mockedWithdraw.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainVote(), { wrapper });

    result.current.confirmVote(TARGET, false);
    await user.click(await screen.findByRole('button', { name: 'Да, отозвать' }));

    await waitFor(() =>
      expect(mockedWithdraw).toHaveBeenCalledWith(1, { requestId: 101, targetRequestId: 202 }),
    );
  });

  it('reports the assembled pill once the backend proposed the chain', async () => {
    mockedVote.mockResolvedValue({ ...VOTED, chainStatus: 'PROPOSED' });
    const { result } = renderHook(() => useChainVote(), { wrapper });

    await act(async () => {
      result.current.confirmVote(TARGET, true);
    });

    expect(await screen.findByText('Цепочка собрана')).toBeInTheDocument();
  });

  it('confirms the vote with a plain success toast while the chain stays a candidate', async () => {
    mockedVote.mockResolvedValue(VOTED);
    const { result } = renderHook(() => useChainVote(), { wrapper });

    await act(async () => {
      result.current.confirmVote(TARGET, true);
    });

    expect(await screen.findByText('Отклик отправлен')).toBeInTheDocument();
  });

  it('invalidates chains and exchange-options after a vote', async () => {
    mockedVote.mockResolvedValue(VOTED);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useChainVote(), { wrapper });

    await act(async () => {
      result.current.confirmVote(TARGET, true);
    });

    await waitFor(() => expect(result.current.isVoting).toBe(false));
    const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
    expect(keys).toContainEqual(['chains']);
    expect(keys).toContainEqual(['exchange-options']);
  });

  it('maps the conflict status to an explanatory toast', async () => {
    mockedVote.mockRejectedValue(axiosError(409));
    const { result } = renderHook(() => useChainVote(), { wrapper });

    await act(async () => {
      result.current.confirmVote(TARGET, true);
    });

    expect(await screen.findByText('Цепочка изменилась: обновите варианты')).toBeInTheDocument();
  });

  it('maps forbidden, not-found and invalid-target statuses', async () => {
    const cases: Array<[number, string]> = [
      [403, 'Это не ваша заявка'],
      [404, 'Цепочка не найдена'],
      [422, 'Некорректный вариант обмена'],
    ];

    for (const [status, expected] of cases) {
      mockedVote.mockRejectedValue(axiosError(status));
      const { result } = renderHook(() => useChainVote(), { wrapper });

      await act(async () => {
        result.current.confirmVote(TARGET, true);
      });

      expect(await screen.findByText(expected)).toBeInTheDocument();
    }
  });

  it('reports a pending vote so the UI can block double submits', async () => {
    mockedVote.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useChainVote(), { wrapper });

    result.current.confirmVote(TARGET, true);

    await waitFor(() => expect(result.current.isVoting).toBe(true));
  });
});
