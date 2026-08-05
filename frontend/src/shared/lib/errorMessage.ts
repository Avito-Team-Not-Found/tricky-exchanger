import { isAxiosError } from 'axios'

const DEFAULT_FALLBACK = 'Не удалось подключиться. Повторите попытку'

// Сопоставляет HTTP-статус ответа с текстом тоста; неизвестный статус или сетевая
// ошибка (нет error.response) получают общий fallback, а не сообщение конкретного статуса.
export function getErrorMessage(
  error: unknown,
  statusMessages: Record<number, string>,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (isAxiosError(error) && error.response) {
    const message = statusMessages[error.response.status]
    if (message) return message
  }
  return fallback
}
