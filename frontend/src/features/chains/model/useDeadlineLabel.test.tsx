import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeadlineLabel } from './useDeadlineLabel';

describe('useDeadlineLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the label for a proposed chain and refreshes it on a 30-second tick', () => {
    const { result } = renderHook(() => useDeadlineLabel('PROPOSED', '2026-08-10T10:01:00Z'));

    expect(result.current).toBe('1 мин');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current).toBe('меньше минуты');
  });

  it('counts from the current time when the deadline arrives after mount', () => {
    const { result, rerender } = renderHook(
      ({ deadline }: { deadline: string | null }) => useDeadlineLabel('PROPOSED', deadline),
      { initialProps: { deadline: null } as { deadline: string | null } },
    );

    expect(result.current).toBeNull();

    vi.setSystemTime(new Date('2026-08-10T10:01:30Z'));

    act(() => {
      rerender({ deadline: '2026-08-10T10:02:00Z' });
    });

    // до первого тика метка ещё от устаревшего now времени монтирования
    expect(result.current).toBe('2 мин');

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe('меньше минуты');
  });

  it('returns null outside PROPOSED even when a deadline is set', () => {
    const { result: candidate } = renderHook(() =>
      useDeadlineLabel('CANDIDATE', '2026-08-12T09:58:00Z'),
    );
    const { result: frozen } = renderHook(() => useDeadlineLabel('FROZEN', '2026-08-12T09:58:00Z'));

    expect(candidate.current).toBeNull();
    expect(frozen.current).toBeNull();
  });

  it('returns null when the deadline is absent', () => {
    const { result } = renderHook(() => useDeadlineLabel('PROPOSED', null));

    expect(result.current).toBeNull();
  });

  it('clears the interval on unmount', () => {
    const { unmount } = renderHook(() => useDeadlineLabel('PROPOSED', '2026-08-12T09:58:00Z'));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not set an interval while there is nothing to count', () => {
    renderHook(() => useDeadlineLabel('FROZEN', '2026-08-12T09:58:00Z'));

    expect(vi.getTimerCount()).toBe(0);
  });
});
