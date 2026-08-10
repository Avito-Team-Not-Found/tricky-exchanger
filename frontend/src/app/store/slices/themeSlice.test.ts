import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setTheme, themeReducer, toggleTheme } from './themeSlice';

function makeStore() {
  return configureStore({ reducer: { theme: themeReducer } });
}

describe('themeSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    // initialState вычисляется при импорте модуля, поэтому проверяем чтение через resetModules
    vi.resetModules();
  });

  it('persists the mode on toggle', () => {
    const store = makeStore();
    store.dispatch(toggleTheme());

    expect(store.getState().theme.mode).toBe('dark');
    expect(localStorage.getItem('tricky_exchanger_theme')).toBe('dark');
  });

  it('persists the mode on setTheme', () => {
    const store = makeStore();
    store.dispatch(setTheme('dark'));
    store.dispatch(setTheme('light'));

    expect(localStorage.getItem('tricky_exchanger_theme')).toBe('light');
  });

  it('restores the stored mode on a fresh module load', async () => {
    localStorage.setItem('tricky_exchanger_theme', 'dark');
    const { themeReducer: freshReducer } = await import('./themeSlice');
    const store = configureStore({ reducer: { theme: freshReducer } });

    expect(store.getState().theme.mode).toBe('dark');
  });
});
