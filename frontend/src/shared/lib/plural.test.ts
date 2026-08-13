import { describe, expect, it } from 'vitest';

import { plural } from './plural';

const FORMS: [string, string, string] = ['участник', 'участника', 'участников'];

describe('plural', () => {
  it('uses the singular form for 1 and for 21/31...', () => {
    expect(plural(1, FORMS)).toBe('участник');
    expect(plural(21, FORMS)).toBe('участник');
    expect(plural(101, FORMS)).toBe('участник');
  });

  it('uses the few form for 2-4 except teens', () => {
    expect(plural(2, FORMS)).toBe('участника');
    expect(plural(4, FORMS)).toBe('участника');
    expect(plural(23, FORMS)).toBe('участника');
  });

  it('uses the many form for 0, 5-20 and teens', () => {
    expect(plural(0, FORMS)).toBe('участников');
    expect(plural(5, FORMS)).toBe('участников');
    expect(plural(11, FORMS)).toBe('участников');
    expect(plural(25, FORMS)).toBe('участников');
  });
});
