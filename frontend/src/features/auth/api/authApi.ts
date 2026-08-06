import type { User } from '@entities/user';

import { apiClient } from '@shared/api';

export interface AuthResponse {
  token: string;
  user: User;
}

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/account/login/', { email, password });
  return data;
}

export async function registerRequest(
  name: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/account/registration/', {
    name,
    email,
    password,
  });
  return data;
}

export interface SendCodeResponse {
  message: 'code_sent';
  // мок-сервер возвращает код, чтобы флоу можно было пройти без эмейл-доставки (PROJECT.md §4.1)
  code: string;
}

export async function sendRecoveryCode(email: string): Promise<SendCodeResponse> {
  const { data } = await apiClient.post<SendCodeResponse>('/account/password-recovery/send-code/', {
    email,
  });
  return data;
}

export async function verifyRecoveryCode(email: string, code: string): Promise<void> {
  await apiClient.post('/account/password-recovery/verify-code/', { email, code });
}

export async function resetPassword(email: string, code: string, password: string): Promise<void> {
  await apiClient.post('/account/password-recovery/reset-password/', { email, code, password });
}
