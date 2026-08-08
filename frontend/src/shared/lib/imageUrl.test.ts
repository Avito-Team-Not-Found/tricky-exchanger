import { describe, expect, it } from 'vitest';

import { publicImageUrl } from './imageUrl';

describe('publicImageUrl', () => {
  it('rewrites the docker-internal MinIO host to the one reachable from the browser', () => {
    expect(publicImageUrl('http://minio:9000/items/items/1/abc.png')).toBe(
      'http://localhost:9000/items/items/1/abc.png',
    );
  });

  it('keeps already-public URLs unchanged', () => {
    expect(publicImageUrl('http://localhost:9000/items/1/x.png')).toBe(
      'http://localhost:9000/items/1/x.png',
    );
    expect(publicImageUrl('https://cdn.example.com/photo.jpg')).toBe(
      'https://cdn.example.com/photo.jpg',
    );
  });

  it('returns undefined for a missing image', () => {
    expect(publicImageUrl(null)).toBeUndefined();
  });
});
