import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { User } from '@entities/user';

import { tokenStorage, userStorage } from '@shared/lib/storage';

interface AuthState {
  token: string | null;
  user: User | null;
}

// сессия восстанавливается из localStorage, чтобы переживать перезагрузку страницы
const initialState: AuthState = {
  token: tokenStorage.get(),
  user: userStorage.get<User>(),
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    loginSucceeded(state, action: PayloadAction<{ token: string; user: User }>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      tokenStorage.set(action.payload.token);
      userStorage.set(action.payload.user);
    },
    // сессия восстановлена по существующему токену (GET /auth/me) — токен не меняется
    sessionRestored(state, action: PayloadAction<User>) {
      state.user = action.payload;
      userStorage.set(action.payload);
    },
    logout(state) {
      state.token = null;
      state.user = null;
      tokenStorage.remove();
      userStorage.remove();
    },
  },
});

export const { loginSucceeded, logout, sessionRestored } = userSlice.actions;
export const userReducer = userSlice.reducer;
