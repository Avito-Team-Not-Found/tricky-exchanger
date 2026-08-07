import { describe, expect, it } from 'vitest';

import { participantAlias } from './alias';

describe('participantAlias', () => {
  it('uses the animals drawn in the mockup for the first positions', () => {
    expect([1, 2, 3].map((position) => participantAlias(position))).toEqual([
      { name: 'Мишка', emoji: '🐻' },
      { name: 'Лиса', emoji: '🦊' },
      { name: 'Кот', emoji: '🐱' },
    ]);
  });

  it('gives every participant of one chain a distinct alias', () => {
    const positions = [1, 2, 3, 4, 5, 6, 7, 8];
    const names = positions.map((position) => participantAlias(position).name);

    expect(new Set(names).size).toBe(positions.length);
  });

  it('wraps around when a chain is longer than the alias list', () => {
    expect(participantAlias(13)).toEqual(participantAlias(1));
  });
});
