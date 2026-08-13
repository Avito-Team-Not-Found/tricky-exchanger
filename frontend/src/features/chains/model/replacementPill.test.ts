import { describe, expect, it } from 'vitest';

import { replacementPillMeta } from './replacementPill';

const NOW = new Date('2026-08-10T12:00:00Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('replacementPillMeta', () => {
  it('marks a recently updated offer as current', () => {
    expect(replacementPillMeta(daysAgo(13), NOW)).toEqual({ text: 'Актуальна', tone: 'success' });
  });

  it('keeps the boundary day inside the current window', () => {
    expect(replacementPillMeta(daysAgo(14), NOW)).toEqual({ text: 'Актуальна', tone: 'success' });
  });

  it('warns about an offer that has not been updated for longer than two weeks', () => {
    expect(replacementPillMeta(daysAgo(15), NOW)).toEqual({
      text: 'Давно не обновлялась',
      tone: 'warning',
    });
  });

  // расхождение часов клиента и сервера не должно давать «давно не обновлялась» на свежей заявке
  it('treats a future timestamp as current', () => {
    expect(replacementPillMeta(daysAgo(-1), NOW)).toEqual({ text: 'Актуальна', tone: 'success' });
  });
});
