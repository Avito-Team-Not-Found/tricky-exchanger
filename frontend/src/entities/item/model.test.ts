import { describe, expect, it } from 'vitest';

import { getItemImageError } from './model';

describe('getItemImageError', () => {
  it('accepts jpeg, png and webp', () => {
    expect(getItemImageError({ type: 'image/jpeg', size: 100 })).toBeNull();
    expect(getItemImageError({ type: 'image/png', size: 100 })).toBeNull();
    expect(getItemImageError({ type: 'image/webp', size: 100 })).toBeNull();
  });

  it('rejects an image type the backend does not accept', () => {
    expect(getItemImageError({ type: 'image/svg+xml', size: 100 })).toBe(
      'Фото должно быть в формате JPG, PNG или WEBP',
    );
    expect(getItemImageError({ type: 'image/gif', size: 100 })).toBe(
      'Фото должно быть в формате JPG, PNG или WEBP',
    );
  });

  it('rejects a file above the backend size limit', () => {
    expect(getItemImageError({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe(
      'Фото не больше 5 МБ',
    );
  });

  it('accepts a file exactly at the size limit', () => {
    expect(getItemImageError({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
  });
});
