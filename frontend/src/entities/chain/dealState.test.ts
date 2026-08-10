import { describe, expect, it } from 'vitest';

import { dealState, hasDeal, type Chain, type ChainParticipant } from './model';

function participant(overrides: Partial<ChainParticipant>): ChainParticipant {
  return {
    clusterId: 1,
    requestId: 101,
    position: 1,
    isCurrentUser: false,
    offeredItemId: 1,
    offeredItemTitle: 'Товар',
    offeredItemDescription: '',
    wantedDescription: 'Хочу другой товар',
    requestStatus: 'LOCKED',
    ...overrides,
  };
}

// кольцо длины 2: я на позиции 1 (currentPosition), источник получаемого — позиция 2
function buildChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 1,
    status: 'FROZEN',
    score: 0.9,
    length: 2,
    version: 1,
    currentRequestId: 101,
    currentPosition: 1,
    givesToPosition: 0,
    receivesFromPosition: 2,
    createdAt: '',
    updatedAt: '',
    participants: [
      participant({ position: 1, requestId: 101, isCurrentUser: true }),
      participant({ position: 2, requestId: 202 }),
    ],
    ...overrides,
  };
}

function me(chain: Chain): ChainParticipant {
  return chain.participants[0];
}

function source(chain: Chain): ChainParticipant {
  return chain.participants[1];
}

describe('dealState', () => {
  it('asks to ship on FROZEN while my request is locked', () => {
    const chain = buildChain({ freezeDeadlineAt: '2026-08-10T12:00:00Z' });
    expect(dealState(chain)).toEqual({ status: 'ship', deadlineAt: '2026-08-10T12:00:00Z' });
  });

  it('keeps the ship screen when a neighbour shipped before me', () => {
    // цепочка IN_PROGRESS, но моя заявка ещё LOCKED — отправлять всё ещё мне
    const chain = buildChain({ status: 'IN_PROGRESS' });
    source(chain).requestStatus = 'IN_PROGRESS';
    expect(dealState(chain)).toEqual({ status: 'ship', deadlineAt: null });
  });

  it('waits for the others when I shipped but not everyone did', () => {
    const chain = buildChain({ status: 'IN_PROGRESS' });
    me(chain).requestStatus = 'IN_PROGRESS';
    expect(dealState(chain)).toEqual({ status: 'shipped-waiting', shipped: 1, total: 2 });
  });

  it('reports all shipped as in-transit while I have not received yet', () => {
    const chain = buildChain({ status: 'IN_PROGRESS' });
    me(chain).requestStatus = 'IN_PROGRESS';
    source(chain).requestStatus = 'IN_PROGRESS';
    expect(dealState(chain)).toEqual({ status: 'in-transit', shipped: 2, total: 2 });
  });

  it('moves to received-waiting once the source request is done', () => {
    const chain = buildChain({ status: 'IN_PROGRESS' });
    me(chain).requestStatus = 'IN_PROGRESS';
    source(chain).requestStatus = 'DONE';
    expect(dealState(chain)).toEqual({ status: 'received-waiting' });
  });

  it('is completed once the chain is completed', () => {
    expect(dealState(buildChain({ status: 'COMPLETED' }))).toEqual({ status: 'completed' });
  });

  it('is unavailable while the chain is not in a deal', () => {
    for (const status of ['CANDIDATE', 'PROPOSED', 'BROKEN'] as const) {
      expect(dealState(buildChain({ status }))).toEqual({ status: 'unavailable' });
    }
  });

  it('is unavailable when the current user is not a participant', () => {
    const chain = buildChain({ status: 'FROZEN' });
    me(chain).isCurrentUser = false;
    source(chain).isCurrentUser = false;
    expect(dealState(chain)).toEqual({ status: 'unavailable' });
  });
});

describe('hasDeal', () => {
  it('covers frozen, in-progress and completed chains', () => {
    expect(hasDeal('FROZEN')).toBe(true);
    expect(hasDeal('IN_PROGRESS')).toBe(true);
    expect(hasDeal('COMPLETED')).toBe(true);
    expect(hasDeal('CANDIDATE')).toBe(false);
    expect(hasDeal('PROPOSED')).toBe(false);
    expect(hasDeal('BROKEN')).toBe(false);
  });
});
