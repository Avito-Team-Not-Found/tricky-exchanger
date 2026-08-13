import { isAxiosError } from 'axios';

const DEFAULT_FALLBACK = 'Не удалось подключиться. Повторите попытку';

export function getErrorMessage(
  error: unknown,
  statusMessages: Record<number, string>,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (isAxiosError(error) && error.response) {
    const message = statusMessages[error.response.status];
    if (message) return message;
  }
  return fallback;
}
