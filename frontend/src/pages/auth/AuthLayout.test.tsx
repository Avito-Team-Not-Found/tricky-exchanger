import { useEffect } from 'react';

import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { store } from '@app/store';

import { resetScreenMotionHistory } from '@shared/lib/useScreenMotion';

import { AuthLayout } from './AuthLayout';

const nav: { current?: (to: string) => void } = {};

function NavProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    nav.current = navigate;
  }, [navigate]);
  return null;
}

function setup() {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <NavProbe />
        <Routes>
          <Route
            path="/login"
            element={
              <AuthLayout>
                <div>login content</div>
              </AuthLayout>
            }
          />
          <Route
            path="/register"
            element={
              <AuthLayout>
                <div>register content</div>
              </AuthLayout>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <AuthLayout>
                <div>recovery content</div>
              </AuthLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  resetScreenMotionHistory();
});

describe('AuthLayout', () => {
  // /login ↔ /register — смена режима: карточка не перемонтируется, иначе таб играл бы slide экрана
  it('keeps the card mounted when switching between login and register', () => {
    const { container } = setup();
    const card = container.querySelector('.auth-page__card');

    act(() => nav.current?.('/register'));

    expect(container.querySelector('.auth-page__card')).toBe(card);
  });

  it('remounts the card when navigating to a different auth screen', () => {
    const { container } = setup();
    const card = container.querySelector('.auth-page__card');

    act(() => nav.current?.('/forgot-password'));

    expect(container.querySelector('.auth-page__card')).not.toBe(card);
  });
});
