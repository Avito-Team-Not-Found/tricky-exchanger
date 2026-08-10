import { describe, expect, it } from 'vitest';

import { maskEmail } from './maskEmail';

describe('maskEmail', () => {
  it('masks a long local part keeping the first two characters', () => {
    expect(maskEmail('anna@example.com')).toBe('an**@example.com');
  });

  it('masks a three-character local part with a single star', () => {
    expect(maskEmail('ann@x.ru')).toBe('an*@x.ru');
  });

  it('masks a two-character local part with a single star', () => {
    expect(maskEmail('ab@x.ru')).toBe('a*@x.ru');
  });

  it('leaves a one-character local part unchanged', () => {
    expect(maskEmail('a@x.ru')).toBe('a@x.ru');
  });

  it('keeps the domain intact', () => {
    expect(maskEmail('anna@mail.example.com')).toBe('an**@mail.example.com');
  });

  it('returns a string without an at-sign as is', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });

  it('returns a string with an empty local part as is', () => {
    expect(maskEmail('@example.com')).toBe('@example.com');
  });
});
