import { beforeEach, describe, expect, it } from 'vitest';

import type { ReplacementOption } from '@entities/chain';

import { replacementInvited } from './replacementInvited';

const OPTION: ReplacementOption = {
  requestId: 42,
  offeredItemId: 17,
  title: 'Кофемашина капсульная',
  description: 'Почти не использовалась',
  wantedDescription: 'Ищу фотоаппарат',
  reliability: 0.82,
  respondedAt: '2026-08-09T12:00:00Z',
};

describe('replacementInvited', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers the invited candidate per chain', () => {
    replacementInvited.set(7, OPTION);

    expect(replacementInvited.get(7)).toEqual({ requestId: 42, option: OPTION });
    expect(replacementInvited.get(8)).toBeNull();
  });

  it('forgets the invitation once cleared', () => {
    replacementInvited.set(7, OPTION);
    replacementInvited.clear(7);

    expect(replacementInvited.get(7)).toBeNull();
  });

  // после апдейта экран ожидания обязан остаться — иначе актор попадёт на пустой пул
  it('reads a legacy flag as an invitation with an unknown candidate', () => {
    localStorage.setItem('tricky_exchanger_replacement_invited_7', '1');

    expect(replacementInvited.get(7)).toEqual({ requestId: null, option: null });
  });

  // хук зовёт эти функции до того, как chainId разобран из маршрута
  it('is a no-op without a chain id', () => {
    expect(replacementInvited.get(undefined)).toBeNull();
    expect(() => replacementInvited.set(undefined, OPTION)).not.toThrow();
    expect(() => replacementInvited.clear(undefined)).not.toThrow();
    expect(localStorage.length).toBe(0);
  });
});
