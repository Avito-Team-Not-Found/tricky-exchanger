import { useEffect, type ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { store } from '@app/store';
import { loginSucceeded } from '@app/store/slices/userSlice';

import { queryClient } from '@shared/api';

import { useLogout } from './useLogout';

const location = { pathname: '' };

function LocationSpy() {
  const { pathname } = useLocation();
  useEffect(() => {
    location.pathname = pathname;
  }, [pathname]);
  return null;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="*" element={children} />
        </Routes>
        <LocationSpy />
      </MemoryRouter>
    </Provider>
  );
}

describe('useLogout', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(
      loginSucceeded({ token: 'jwt', user: { id: '1', name: 'Анна', email: 'anna@example.com' } }),
    );
    queryClient.setQueryData(['products'], ['stale-data']);
  });

  it('clears the session, the query cache, and redirects to /login', () => {
    const { result } = renderHook(() => useLogout(), { wrapper });

    act(() => {
      result.current();
    });

    expect(store.getState().user.token).toBeNull();
    expect(queryClient.getQueryData(['products'])).toBeUndefined();
    expect(location.pathname).toBe('/login');
  });
});
