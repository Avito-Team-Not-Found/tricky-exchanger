import { beforeEach, describe, expect, it } from 'vitest';

import { themeStorage, tokenStorage, userStorage } from './storage';

describe('tokenStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(tokenStorage.get()).toBeNull();
  });

  it('round-trips a token', () => {
    tokenStorage.set('jwt-token');
    expect(tokenStorage.get()).toBe('jwt-token');
  });

  it('removes the stored token', () => {
    tokenStorage.set('jwt-token');
    tokenStorage.remove();
    expect(tokenStorage.get()).toBeNull();
  });
});

describe('themeStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(themeStorage.get()).toBeNull();
  });

  it('round-trips the selected mode', () => {
    themeStorage.set('dark');
    expect(themeStorage.get()).toBe('dark');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('tricky_exchanger_theme', 'sepia');
    expect(themeStorage.get()).toBeNull();
  });
});

describe('userStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a user object', () => {
    const user = { id: '1', name: 'Анна', email: 'anna@example.com' };
    userStorage.set(user);
    expect(userStorage.get<typeof user>()).toEqual(user);
  });

  it('returns null for corrupted json', () => {
    localStorage.setItem('tricky_exchanger_user', '{broken');
    expect(userStorage.get()).toBeNull();
  });

  it('removes the stored user', () => {
    userStorage.set({ id: '1', name: 'Анна' });
    userStorage.remove();
    expect(userStorage.get()).toBeNull();
  });
});
