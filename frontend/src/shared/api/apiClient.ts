import axios, { AxiosError } from 'axios';

import { env } from '@shared/config/env';
import { tokenStorage, userStorage } from '@shared/lib/storage';

const API_BASE_URL = `${env.apiBaseUrl}/api/v1`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // токен протух или отозван сервером — чистим хранилище (токен и юзера, как logout()) и отправляем на вход
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      tokenStorage.remove();
      userStorage.remove();
      window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);
