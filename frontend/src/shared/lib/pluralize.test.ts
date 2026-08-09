import { describe, expect, it } from 'vitest';

import { pluralizeRu } from './pluralize';

function participants(count: number): string {
  return pluralizeRu(count, 'участник', 'участника', 'участников');
}

describe('pluralizeRu', () => {
  it('picks the singular form for numbers ending in one', () => {
    expect(participants(1)).toBe('участник');
    expect(participants(21)).toBe('участник');
  });

  it('picks the few form for numbers ending in two to four', () => {
    expect(participants(2)).toBe('участника');
    expect(participants(4)).toBe('участника');
    expect(participants(22)).toBe('участника');
  });

  it('picks the many form from five onwards', () => {
    expect(participants(5)).toBe('участников');
    expect(participants(0)).toBe('участников');
  });

  // 11–14 — исключение из правила по последней цифре
  it('handles the eleven-to-fourteen exception', () => {
    expect(participants(11)).toBe('участников');
    expect(participants(12)).toBe('участников');
    expect(participants(14)).toBe('участников');
    expect(participants(111)).toBe('участников');
  });
});
