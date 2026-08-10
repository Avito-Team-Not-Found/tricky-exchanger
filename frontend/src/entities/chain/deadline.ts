// Остаток до дедлайна ответа второго раунда (макет 4.6/4.7: «Осталось 47 ч 58 мин на ответ»).
// null — дедлайна нет, он невалиден или уже прошёл: строку не показываем, откат цепочки
// бэкенд делает лениво сам (SOFT-LOCK §3.1)
export function formatRemaining(deadlineAt: string | null | undefined, now: number): string | null {
  const deadline = Date.parse(deadlineAt ?? '');
  if (Number.isNaN(deadline) || deadline <= now) return null;
  const totalMinutes = Math.floor((deadline - now) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  if (minutes > 0) return `${minutes} мин`;
  return 'меньше минуты';
}
