import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from './useReducedMotion';

const originalMatchMedia = window.matchMedia;

// подменяем matchMedia целиком: шим из vitest.setup.ts всегда отдаёт matches: false и не умеет
// уведомлять подписчиков, а проверять надо именно реакцию на смену системной настройки
function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();

  window.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;

  return function emit(next: boolean) {
    matches = next;
    listeners.forEach((listener) => listener());
  };
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('useReducedMotion', () => {
  it('reports the current system setting on the first render', () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('updates when the system setting changes', () => {
    const emit = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());

    act(() => emit(true));

    expect(result.current).toBe(true);
  });
});
