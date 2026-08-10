// Маскирование локальной части email для показа (шаг ввода кода восстановления пароля).
// Домен не трогаем — иначе пользователь не поймёт, в каком ящике искать письмо. Строка
// без @ возвращается как есть: хелпер не должен падать на невалидном значении.
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  // Math.max страхует пустую локальную часть ('@example.com') от '*' .repeat(-1)
  if (local.length <= 2) {
    return `${local.charAt(0)}${'*'.repeat(Math.max(0, local.length - 1))}${domain}`;
  }
  return `${local.slice(0, 2)}${'*'.repeat(local.length - 2)}${domain}`;
}
