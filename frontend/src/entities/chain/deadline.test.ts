import { describe, expect, it } from 'vitest';

import { formatRemaining } from './deadline';

describe('formatRemaining', () => {
  const NOW = Date.parse('2026-08-10T10:00:00Z');

  it('formats the remaining time as hours and minutes', () => {
    expect(formatRemaining('2026-08-12T09:58:00Z', NOW)).toBe('47 ч 58 мин');
  });

  it('formats less than an hour as minutes only', () => {
    expect(formatRemaining('2026-08-10T10:58:00Z', NOW)).toBe('58 мин');
  });

  it('formats less than a minute without numbers', () => {
    expect(formatRemaining('2026-08-10T10:00:30Z', NOW)).toBe('меньше минуты');
  });

  it('returns null for a past deadline', () => {
    expect(formatRemaining('2026-08-10T09:59:00Z', NOW)).toBeNull();
  });

  it('returns null for null, undefined and garbage', () => {
    expect(formatRemaining(null, NOW)).toBeNull();
    expect(formatRemaining(undefined, NOW)).toBeNull();
    expect(formatRemaining('not a date', NOW)).toBeNull();
  });
});
