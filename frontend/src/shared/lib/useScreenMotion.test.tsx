import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetScreenMotionHistory, useScreenMotionClass } from './useScreenMotion';

const nav: { current?: ReturnType<typeof useNavigate> } = {};

function NavProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    nav.current = navigate;
  }, [navigate]);
  return null;
}

function renderScreenMotion() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/login']}>
      <NavProbe />
      {children}
    </MemoryRouter>
  );
  return renderHook(() => useScreenMotionClass(), { wrapper });
}

beforeEach(() => {
  resetScreenMotionHistory();
});

describe('useScreenMotionClass', () => {
  it('does not animate the very first screen (cold start is a POP)', () => {
    const { result } = renderScreenMotion();

    expect(result.current).toBe('');
  });

  it('animates a PUSH navigation as a forward transition', () => {
    const { result } = renderScreenMotion();

    act(() => nav.current?.('/products'));

    expect(result.current).toBe('motion-screen');
  });

  it('animates a POP back to a previously visited screen as a back transition', () => {
    const { result } = renderScreenMotion();

    act(() => nav.current?.('/products'));
    act(() => nav.current?.(-1));

    expect(result.current).toBe('motion-screen motion-screen--back');
  });

  it('animates a POP forward in the history as a forward transition', () => {
    const { result } = renderScreenMotion();

    act(() => nav.current?.('/products'));
    act(() => nav.current?.(-1));
    act(() => nav.current?.(1));

    expect(result.current).toBe('motion-screen');
  });

  it('animates a REPLACE navigation as a forward transition', () => {
    const { result } = renderScreenMotion();

    act(() => nav.current?.('/products', { replace: true }));

    expect(result.current).toBe('motion-screen');
  });
});
