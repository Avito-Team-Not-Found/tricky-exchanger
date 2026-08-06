import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tokenStorage, userStorage } from '@shared/lib/storage';

import { apiClient } from './apiClient';

function rejectingAdapter(status: number) {
  const error = new AxiosError('Request failed');
  Object.assign(error, { response: { status } });
  return () => Promise.reject(error);
}

describe('apiClient', () => {
  const originalLocation = window.location;
  const assign = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    tokenStorage.set('jwt-token');
    userStorage.set({ id: '1', name: 'Анна', email: 'anna@example.com' });
    assign.mockClear();
    // jsdom's window.location.assign isn't configurable enough for vi.spyOn — replace the object instead
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { ...originalLocation, assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
  });

  it('clears both the token and the stored user on a 401 response', async () => {
    await expect(
      apiClient.get('/whatever', { adapter: rejectingAdapter(401) }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(tokenStorage.get()).toBeNull();
    expect(userStorage.get()).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('leaves the session untouched for a non-401 error', async () => {
    await expect(
      apiClient.get('/whatever', { adapter: rejectingAdapter(500) }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(tokenStorage.get()).toBe('jwt-token');
    expect(userStorage.get()).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });
});
