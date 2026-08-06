import { apiClient } from '@shared/api';

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/account/password-change/', { currentPassword, newPassword });
}
