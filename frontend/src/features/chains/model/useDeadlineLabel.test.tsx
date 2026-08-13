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

  it('returns the remaining time for the response deadline and refreshes it on a 30-second tick', () => {
    const { result } = renderHook(() => useDeadlineLabel('response', '2026-08-10T10:01:00Z'));

    expect(result.current).toBe('1 мин');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current).toBe('меньше минуты');
  });

  it('counts the ship deadline the same way', () => {
    const { result } = renderHook(() => useDeadlineLabel('ship', '2026-08-10T10:01:00Z'));

    expect(result.current).toBe('1 мин');
  });

  it('counts from the current time when the deadline arrives after mount', () => {
    const { result, rerender } = renderHook(
      ({ deadline }: { deadline: string | null }) => useDeadlineLabel('response', deadline),
      { initialProps: { deadline: null } as { deadline: string | null } },
    );

    expect(result.current).toBeNull();

    vi.setSystemTime(new Date('2026-08-10T10:01:30Z'));

    act(() => {
      rerender({ deadline: '2026-08-10T10:02:00Z' });
    });

    // метка считается от часов на момент рендера, а не от времени монтирования: иначе до
    // первого тика показывались бы «2 мин» вместо реальных 30 секунд
    expect(result.current).toBe('меньше минуты');
  });

  it('returns null when the purpose is disabled even with a deadline set', () => {
    const { result } = renderHook(() => useDeadlineLabel(null, '2026-08-12T09:58:00Z'));

    expect(result.current).toBeNull();
  });

  it('returns null when the deadline is absent', () => {
    const { result } = renderHook(() => useDeadlineLabel('response', null));

    expect(result.current).toBeNull();
  });

  it('clears the interval on unmount', () => {
    const { unmount } = renderHook(() => useDeadlineLabel('ship', '2026-08-12T09:58:00Z'));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not set an interval while there is nothing to count', () => {
    renderHook(() => useDeadlineLabel(null, '2026-08-12T09:58:00Z'));

    expect(vi.getTimerCount()).toBe(0);
  });
});
