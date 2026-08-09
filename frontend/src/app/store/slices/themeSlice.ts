import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { themeStorage } from '@shared/lib/storage';

export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
}

// выбор темы переживает перезагрузку страницы; без сохранённого значения — светлая, как в index.html
const initialState: ThemeState = {
  mode: themeStorage.get() ?? 'light',
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      themeStorage.set(state.mode);
    },
    toggleTheme(state) {
      state.mode = state.mode === 'light' ? 'dark' : 'light';
      themeStorage.set(state.mode);
    },
  },
});

export const { setTheme, toggleTheme } = themeSlice.actions;
export const themeReducer = themeSlice.reducer;
