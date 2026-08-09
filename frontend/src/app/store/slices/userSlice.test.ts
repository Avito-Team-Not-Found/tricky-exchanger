import { beforeEach, describe, expect, it } from 'vitest';

import { store } from '../index';

import { loginSucceeded, logout, sessionRestored } from './userSlice';

const session = {
  token: 'jwt-token',
  user: { id: '1', fullName: 'Анна', email: 'anna@example.com' },
};

describe('user slice', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(logout());
  });

  it('starts logged out', () => {
    expect(store.getState().user.token).toBeNull();
    expect(store.getState().user.user).toBeNull();
  });

  it('stores the session and persists it to localStorage', () => {
    store.dispatch(loginSucceeded(session));

    expect(store.getState().user).toEqual(session);
    expect(localStorage.getItem('tricky_exchanger_token')).toBe('jwt-token');
    expect(localStorage.getItem('tricky_exchanger_user')).toBe(JSON.stringify(session.user));
  });

  it('updates the user without touching the token on session restore', () => {
    store.dispatch(loginSucceeded(session));

    const restored = { id: '1', fullName: 'Анна Иванова', email: 'anna@example.com' };
    store.dispatch(sessionRestored(restored));

    expect(store.getState().user.token).toBe('jwt-token');
    expect(store.getState().user.user).toEqual(restored);
    expect(localStorage.getItem('tricky_exchanger_user')).toBe(JSON.stringify(restored));
  });

  it('clears the session and localStorage on logout', () => {
    store.dispatch(loginSucceeded(session));
    store.dispatch(logout());

    expect(store.getState().user.token).toBeNull();
    expect(store.getState().user.user).toBeNull();
    expect(localStorage.getItem('tricky_exchanger_token')).toBeNull();
    expect(localStorage.getItem('tricky_exchanger_user')).toBeNull();
  });
});
