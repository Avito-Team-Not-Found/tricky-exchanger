import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Chain, ChainParticipant } from '@entities/chain';

import { chainDeadlinePurpose, useDeadlineLabel } from './useDeadlineLabel';

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

  it('counts the fast-replacement deadline the same way', () => {
    const { result } = renderHook(() => useDeadlineLabel('replacement', '2026-08-10T10:01:00Z'));

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

describe('chainDeadlinePurpose', () => {
  const ME: ChainParticipant = {
    clusterId: 1,
    requestId: 101,
    position: 1,
    isCurrentUser: true,
    offeredItemId: 1,
    offeredItemTitle: 'Велосипед',
    offeredItemDescription: '',
    wantedDescription: 'Хочу фотоаппарат',
    requestStatus: 'ACTIVE',
  };
  const NEXT: ChainParticipant = { ...ME, requestId: 202, position: 2, isCurrentUser: false };

  // мой голос второго круга лежит на следующей позиции кольца
  function buildReplacementChain(myVote: ChainParticipant['vote']): Chain {
    return {
      id: 1,
      status: 'PROPOSED',
      invalidReason: 'frozen_replacement',
      score: 0.5,
      length: 2,
      version: 1,
      currentRequestId: 101,
      currentPosition: 1,
      givesToPosition: 2,
      receivesFromPosition: 2,
      createdAt: '',
      updatedAt: '',
      participants: [ME, { ...NEXT, vote: myVote }],
    };
  }

  it('counts down the replacement search for the participant who already confirmed', () => {
    expect(chainDeadlinePurpose(buildReplacementChain('approved'))).toBe('replacement');
  });

  it('counts down the answer for the invited candidate', () => {
    expect(chainDeadlinePurpose(buildReplacementChain('pending'))).toBe('response');
  });

  it('leaves the purpose to the status outside a replacement round', () => {
    const chain = buildReplacementChain('pending');

    expect(chainDeadlinePurpose({ ...chain, invalidReason: undefined })).toBeUndefined();
  });
});
