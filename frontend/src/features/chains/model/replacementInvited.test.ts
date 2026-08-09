import { beforeEach, describe, expect, it } from 'vitest';

import { replacementInvited } from './replacementInvited';

describe('replacementInvited', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers the invitation per chain', () => {
    replacementInvited.set(7);

    expect(replacementInvited.get(7)).toBe(true);
    // ключ на цепочку: приглашение в одной цепочке ничего не говорит о другой
    expect(replacementInvited.get(8)).toBe(false);
  });

  it('forgets the invitation once cleared', () => {
    replacementInvited.set(7);
    replacementInvited.clear(7);

    expect(replacementInvited.get(7)).toBe(false);
  });

  // хук зовёт эти функции до того, как chainId разобран из маршрута
  it('is a no-op without a chain id', () => {
    expect(replacementInvited.get(undefined)).toBe(false);
    expect(() => replacementInvited.set(undefined)).not.toThrow();
    expect(() => replacementInvited.clear(undefined)).not.toThrow();
    expect(localStorage.length).toBe(0);
  });
});
