import { useEffect, type ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { AxiosError } from 'axios';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '@app/store';
import { loginSucceeded } from '@app/store/slices/userSlice';

import { queryClient } from '@shared/api';

import { logoutRequest } from '../api/authApi';

import { useLogout } from './useLogout';

vi.mock('../api/authApi', () => ({
  logoutRequest: vi.fn(),
}));

const mockedLogoutRequest = vi.mocked(logoutRequest);

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
      loginSucceeded({
        token: 'jwt',
        user: { id: '1', fullName: 'Анна', email: 'anna@example.com' },
      }),
    );
    queryClient.setQueryData(['products'], ['stale-data']);
    vi.clearAllMocks();
  });

  it('notifies the backend, clears the session and cache, and redirects to /login', async () => {
    mockedLogoutRequest.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogout(), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(mockedLogoutRequest).toHaveBeenCalledOnce();
    expect(store.getState().user.token).toBeNull();
    expect(queryClient.getQueryData(['products'])).toBeUndefined();
    expect(location.pathname).toBe('/login');
  });

  it('still logs out locally when the backend is unreachable', async () => {
    mockedLogoutRequest.mockRejectedValue(
      Object.assign(new AxiosError('Network Error'), { request: {} }),
    );
    const { result } = renderHook(() => useLogout(), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(store.getState().user.token).toBeNull();
    expect(location.pathname).toBe('/login');
  });
});
