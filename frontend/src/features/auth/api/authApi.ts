import type { User } from '@entities/user';

import { apiClient } from '@shared/api';

export interface AuthResponse {
  token: string;
  user: User;
}

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function registerRequest(
  fullName: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', {
    fullName,
    email,
    password,
  });
  return data;
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function fetchMeRequest(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me');
  return data;
}

export interface SendCodeResponse {
  message: 'code_sent';
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
