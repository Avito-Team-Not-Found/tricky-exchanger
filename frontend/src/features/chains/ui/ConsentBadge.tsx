import './ConsentBadge.scss';

export interface ConsentBadgeProps {
  count: number;
  total: number;
  className?: string;
}

// на FROZEN счётчик всегда M/M; значение подаётся текстом, а не одним цветом
export function ConsentBadge({ count, total, className }: ConsentBadgeProps) {
  return (
    <span
      className={`consent-badge${className ? ` ${className}` : ''}`}
      aria-label={`${count} из ${total} согласий`}
    >
      {count}/{total} согласий
    </span>
  );
}
