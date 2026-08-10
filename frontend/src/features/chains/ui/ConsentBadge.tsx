import './ConsentBadge.scss';

export interface ConsentBadgeProps {
  count: number;
  total: number;
  className?: string;
}

// Бейдж согласий второго раунда «N/M согласий» (SOFT-LOCK §5.1): на PROPOSED — число
// подтвердивших участников, на FROZEN — всегда M/M. Число и общее всегда текстом, не только цветом
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
