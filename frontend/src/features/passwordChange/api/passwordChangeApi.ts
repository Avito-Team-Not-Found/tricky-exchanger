import { apiClient } from '@shared/api';

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  newPasswordConfirmation: string,
): Promise<void> {
  await apiClient.post('/auth/change-password', {
    currentPassword,
    newPassword,
    newPasswordConfirmation,
  });
}
