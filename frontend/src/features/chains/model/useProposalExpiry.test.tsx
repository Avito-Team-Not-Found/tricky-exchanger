import type { ReactNode } from 'react';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useProposalExpiry, type ProposalExpiryState } from './useProposalExpiry';

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useProposalExpiry', () => {
  let client: QueryClient;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    client = createTestQueryClient();
    invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(initial: ProposalExpiryState[]) {
    return renderHook(
      ({ states }: { states: ProposalExpiryState[] }) => useProposalExpiry(states),
      {
        initialProps: { states: initial },
        wrapper: wrapperFor(client),
      },
    );
  }

  // просрочку снимает только GET /chains/{id}: пока список не перезапросили, он отдаёт
  // устаревший PROPOSED и карточка держит живые кнопки второго раунда
  it('invalidates the offer list once the detail has left PROPOSED', () => {
    const { rerender } = render([
      {
        chainId: 7,
        listStatus: 'PROPOSED',
        detailStatus: 'PROPOSED',
        deadlineAt: '2026-08-12T09:58:00Z',
      },
    ]);

    expect(invalidate).not.toHaveBeenCalled();

    act(() => {
      rerender({
        states: [
          { chainId: 7, listStatus: 'PROPOSED', detailStatus: 'CANDIDATE', deadlineAt: null },
        ],
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exchange-options'] });
  });

  it('keeps the list untouched while the list and the detail agree', () => {
    render([
      {
        chainId: 7,
        listStatus: 'PROPOSED',
        detailStatus: 'PROPOSED',
        deadlineAt: '2026-08-12T09:58:00Z',
      },
    ]);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  // без детали (её ещё не запросили) статус списка сам по себе ничего не говорит о просрочке
  it('ignores entries whose detail has not arrived yet', () => {
    render([{ chainId: 7, listStatus: 'PROPOSED' }]);

    expect(invalidate).not.toHaveBeenCalled();
  });

  // в момент дедлайна дёргаем деталь: её ответ и выполнит ленивый откат на бэкенде
  it('refetches the chain detail right after the deadline passes', () => {
    render([
      {
        chainId: 7,
        listStatus: 'PROPOSED',
        detailStatus: 'PROPOSED',
        deadlineAt: '2026-08-10T10:01:00Z',
      },
    ]);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(invalidate).not.toHaveBeenCalled();

    // запас на расхождение часов клиента и сервера
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chains', 7] });
  });

  it('fires immediately when the cached detail is already past its deadline', () => {
    render([
      {
        chainId: 7,
        listStatus: 'PROPOSED',
        detailStatus: 'PROPOSED',
        deadlineAt: '2026-08-10T09:00:00Z',
      },
    ]);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chains', 7] });
  });

  it('does not schedule anything for candidate chains', () => {
    render([{ chainId: 7, listStatus: 'CANDIDATE', detailStatus: 'CANDIDATE', deadlineAt: null }]);

    expect(vi.getTimerCount()).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
  });

  // 4.7: списка рядом нет, дедлайн виден только в детали — таймер всё равно нужен
  it('refetches the detail after the deadline without a list status', () => {
    render([{ chainId: 7, detailStatus: 'PROPOSED', deadlineAt: '2026-08-10T10:01:00Z' }]);

    act(() => {
      vi.advanceTimersByTime(62_000);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['chains', 7] });
  });

  // список остаётся протухшим на весь staleTime, если откат случился на 4.7 — возврат на 4.6
  // показал бы PROPOSED с живыми кнопками
  it('invalidates the offer list when the watched detail leaves PROPOSED', () => {
    const { rerender } = render([
      { chainId: 7, detailStatus: 'PROPOSED', deadlineAt: '2026-08-10T10:01:00Z' },
    ]);

    act(() => {
      rerender({ states: [{ chainId: 7, detailStatus: 'CANDIDATE', deadlineAt: null }] });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exchange-options'] });
  });

  // деталь, открытая уже не в PROPOSED, ничего не говорит о свежести списка
  it('keeps the list untouched for a detail that was never seen as PROPOSED', () => {
    render([{ chainId: 7, detailStatus: 'COMPLETED', deadlineAt: null }]);

    expect(invalidate).not.toHaveBeenCalled();
  });

  // обход должен дойти до конца массива: иначе статус второй цепочки не запомнится и её
  // собственный откат позже уже не распознается
  it('remembers detail statuses past the first stale entry', () => {
    const { rerender } = render([
      { chainId: 7, listStatus: 'PROPOSED', detailStatus: 'CANDIDATE', deadlineAt: null },
      { chainId: 8, detailStatus: 'PROPOSED', deadlineAt: '2026-08-12T09:58:00Z' },
    ]);
    invalidate.mockClear();

    act(() => {
      rerender({
        states: [
          { chainId: 7, listStatus: 'CANDIDATE', detailStatus: 'CANDIDATE', deadlineAt: null },
          { chainId: 8, detailStatus: 'CANDIDATE', deadlineAt: null },
        ],
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exchange-options'] });
  });
});
