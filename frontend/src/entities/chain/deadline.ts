// Остаток до дедлайна (ответа второго раунда или отправки товара — «Осталось 47 ч 58 мин …»).
// null — дедлайна нет, он невалиден или уже прошёл: строку не показываем, откат цепочки
// бэкенд делает лениво сам
export function formatRemaining(deadlineAt: string | null | undefined, now: number): string | null {
  const deadline = Date.parse(deadlineAt ?? '');
  if (Number.isNaN(deadline) || deadline <= now) return null;
  const totalMinutes = Math.floor((deadline - now) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  // ровно столько-то часов пишем без «0 мин» — «1 ч 0 мин» читается как ошибка вёрстки
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  if (minutes > 0) return `${minutes} мин`;
  return 'меньше минуты';
}
