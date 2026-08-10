import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmChain,
  declineChain,
  thinkChain,
  type ConfirmResult,
  type DeclineResult,
} from '@entities/chain';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useChainConfirm } from './useChainConfirm';

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, confirmChain: vi.fn(), declineChain: vi.fn(), thinkChain: vi.fn() };
});

const mockedConfirm = vi.mocked(confirmChain);
const mockedDecline = vi.mocked(declineChain);
const mockedThink = vi.mocked(thinkChain);

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

function declined(status: DeclineResult['status']): DeclineResult {
  return { chainId: 1, status, replacementAvailable: false };
}

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

  it('closes the decision modal when the chain has been removed', async () => {
    mockedConfirm.mockRejectedValue(axiosError(404));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(vi.fn(), vi.fn()), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Да' }));
    expect(await screen.findByText('Цепочка не найдена')).toBeInTheDocument();

    // jsdom не доигрывает анимации antd, поэтому из DOM модалка не исчезает — наблюдаем её уход
    await waitFor(() => expect(document.querySelector('.ant-modal')).toHaveClass('ant-zoom-leave'));
  });

  it('asks for a second confirmation before declining', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Отказ' }));

    expect(
      await screen.findByText(
        'Ваш товар вернётся в другие варианты обмена, а цепочка распадётся или будет пересобрана.',
      ),
    ).toBeInTheDocument();
    expect(mockedDecline).not.toHaveBeenCalled();
  });

  it('declines participation on «Да, отказаться»', async () => {
    mockedDecline.mockResolvedValue(declined('CANDIDATE'));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Отказ' }));
    await user.click(await screen.findByRole('button', { name: 'Да, отказаться' }));

    await waitFor(() => expect(mockedDecline).toHaveBeenCalledWith(1));
  });

  it('keeps the chain untouched when the decline is cancelled', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Отказ' }));
    await user.click((await screen.findAllByRole('button', { name: 'Отмена' })).at(-1)!);

    expect(mockedDecline).not.toHaveBeenCalled();
    expect(screen.getByText('Все участники найдены')).toBeInTheDocument();
  });

  it('toasts each outcome of a decline', async () => {
    const cases: Array<[DeclineResult['status'], string]> = [
      ['BROKEN', 'Вы вышли из сделки. Цепочка распалась'],
      ['CANDIDATE', 'Вы вышли из сделки. Цепочка вернулась к сбору откликов'],
      ['PROPOSED', 'Вы вышли из сделки. Участники подбирают замену'],
    ];

    for (const [status, expected] of cases) {
      mockedDecline.mockResolvedValue(declined(status));
      const user = userEvent.setup();
      const { result, unmount } = renderHook(() => useChainConfirm(), { wrapper });

      act(() => result.current.openConfirm(1));
      await user.click(await screen.findByRole('button', { name: 'Отказ' }));
      await user.click(await screen.findByRole('button', { name: 'Да, отказаться' }));

      expect(await screen.findByText(expected)).toBeInTheDocument();
      // модалки соседних итераций иначе остаются в DOM и делают запросы неоднозначными
      unmount();
    }
  });

  it('leaves the chain screen when the chain has fallen apart', async () => {
    const onNotFound = vi.fn();
    mockedDecline.mockResolvedValue(declined('BROKEN'));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(vi.fn(), onNotFound), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Отказ' }));
    await user.click(await screen.findByRole('button', { name: 'Да, отказаться' }));

    await waitFor(() => expect(onNotFound).toHaveBeenCalled());
  });

  it('falls back to a decline-specific error toast', async () => {
    const refetch = vi.fn();
    mockedDecline.mockRejectedValue(axiosError(500));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(refetch), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Отказ' }));
    await user.click(await screen.findByRole('button', { name: 'Да, отказаться' }));

    expect(await screen.findByText('Не удалось отказаться от участия')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('opens the think modal from the decision modal and posts /think on «Да»', async () => {
    mockedThink.mockResolvedValue({ chainId: 1, vote: 'thinking' });
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Я подумаю' }));

    expect(await screen.findByText('Вы уверены?')).toBeInTheDocument();
    expect(
      screen.getByText('Пока вы думаете, ваше место в цепочке могут занять другие участники.'),
    ).toBeInTheDocument();

    // предыдущая модалка ещё в DOM на zoom-leave — берём «Да» из последней (новой) модалки
    await user.click((await screen.findAllByRole('button', { name: 'Да' })).at(-1)!);
    await waitFor(() => expect(mockedThink).toHaveBeenCalledWith(1));
  });

  it('returns to the decision modal from the think modal without a request', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Я подумаю' }));
    await user.click(await screen.findByRole('button', { name: 'Вернуться' }));

    // старая и переоткрытая модалки на мгновение обе в DOM (jsdom не доигрывает zoom-leave)
    expect((await screen.findAllByText('Все участники найдены')).length).toBeGreaterThan(0);
    expect(mockedThink).not.toHaveBeenCalled();
  });

  it('posts /think directly from the think modal and stays closed on success', async () => {
    mockedThink.mockResolvedValue({ chainId: 1, vote: 'thinking' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Я подумаю' }));
    await user.click((await screen.findAllByRole('button', { name: 'Да' })).at(-1)!);

    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
      expect(keys).toContainEqual(['chains']);
      expect(keys).toContainEqual(['exchange-options']);
    });
  });

  it('does not turn on the thinking mode when think fails with a conflict', async () => {
    const refetch = vi.fn();
    mockedThink.mockRejectedValue(axiosError(409));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(refetch), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Я подумаю' }));
    await user.click((await screen.findAllByRole('button', { name: 'Да' })).at(-1)!);

    expect(await screen.findByText('Цепочка изменилась: обновите варианты')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('treats an expired deadline as a warning and refreshes the data', async () => {
    const refetch = vi.fn();
    mockedConfirm.mockRejectedValue(axiosError(410));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainConfirm(refetch), { wrapper });

    act(() => result.current.openConfirm(1));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    expect(
      await screen.findByText('Время на ответ истекло, цепочка распалась'),
    ).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('confirms directly without the modal on the inline «Да»', async () => {
    mockedConfirm.mockResolvedValue(PROPOSED);
    const { result } = renderHook(() => useChainConfirm(), { wrapper });

    act(() => result.current.confirmNow(1));
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith(1));
  });
});
