import { describe, expect, it } from 'vitest';

import {
  bestChainId,
  chainLinks,
  myParticipant,
  receivesItem,
  type Chain,
  type ChainParticipant,
  type ExchangeOptions,
} from './model';

const MYSELF: ChainParticipant = {
  clusterId: 1,
  requestId: 101,
  position: 1,
  isCurrentUser: true,
  offeredItemId: 1,
  offeredItemTitle: 'Велосипед',
  offeredItemDescription: '',
  wantedDescription: 'Хочу фотоаппарат',
};

const OTHER: ChainParticipant = {
  clusterId: 2,
  requestId: 202,
  position: 2,
  isCurrentUser: false,
  offeredItemId: 2,
  offeredItemTitle: 'Фотоаппарат',
  offeredItemDescription: 'Полный комплект',
  wantedDescription: 'Хочу велосипед',
  imageUrl: 'http://localhost:9000/photos/camera.jpg',
};

function buildChain(participants = [MYSELF, OTHER], overrides: Partial<Chain> = {}): Chain {
  return {
    id: 1,
    status: 'CANDIDATE',
    score: 0.72,
    length: 2,
    version: 1,
    currentRequestId: 101,
    currentPosition: 1,
    givesToPosition: 2,
    receivesFromPosition: 2,
    createdAt: '',
    updatedAt: '',
    participants,
    ...overrides,
  };
}

describe('myParticipant', () => {
  it('returns the participant of the current user', () => {
    expect(myParticipant(buildChain())).toEqual(MYSELF);
  });

  it('returns null when the user is not in the chain', () => {
    const chain = buildChain([OTHER]);
    expect(myParticipant(chain)).toBeNull();
  });
});

describe('chainLinks', () => {
  it('groups the candidate pool by position', () => {
    const pool = [
      MYSELF,
      OTHER,
      { ...OTHER, requestId: 203, offeredItemTitle: 'Планшет' },
      // вторая заявка на позиции 1 — та же позиция, другой кандидат кластера
      { ...MYSELF, requestId: 104, offeredItemTitle: 'Самокат' },
    ];
    const links = chainLinks(buildChain(pool));

    expect(links).toEqual([
      {
        position: 1,
        candidates: [MYSELF, { ...MYSELF, requestId: 104, offeredItemTitle: 'Самокат' }],
      },
      {
        position: 2,
        candidates: [OTHER, { ...OTHER, requestId: 203, offeredItemTitle: 'Планшет' }],
      },
    ]);
  });

  it('keeps positions sorted ascending regardless of input order', () => {
    const links = chainLinks(buildChain([OTHER, MYSELF]));
    expect(links.map((link) => link.position)).toEqual([1, 2]);
  });
});

describe('bestChainId', () => {
  function buildOptions(chainId: number, score: number): ExchangeOptions {
    return { chainId, score } as ExchangeOptions;
  }

  it('picks the chain with the highest score', () => {
    const options = [buildOptions(1, 0.55), buildOptions(2, 0.91), buildOptions(3, 0.72)];
    expect(bestChainId(options)).toBe(2);
  });

  // отметка не должна прыгать между равными цепочками при каждом рефетче
  it('resolves a score tie by the lower chain id', () => {
    const options = [buildOptions(7, 0.8), buildOptions(3, 0.8)];
    expect(bestChainId(options)).toBe(3);
  });

  // у заявки чаще всего ровно одна цепочка — она и есть лучший вариант для этого товара
  it('marks the only option as the best one', () => {
    expect(bestChainId([buildOptions(1, 0.91)])).toBe(1);
  });

  it('marks nothing when there are no options', () => {
    expect(bestChainId([])).toBeNull();
  });
});

describe('receivesItem', () => {
  it('returns the candidate pool of the receiving position', () => {
    const chain = buildChain();
    expect(receivesItem(chain)).toEqual([OTHER]);
  });

  it('returns all candidates when the receiving position holds a pool', () => {
    const pool = [MYSELF, OTHER, { ...OTHER, requestId: 203, offeredItemTitle: 'Планшет' }];
    expect(receivesItem(buildChain(pool))).toEqual([
      OTHER,
      { ...OTHER, requestId: 203, offeredItemTitle: 'Планшет' },
    ]);
  });

  it('returns an empty array when the receiving position is missing', () => {
    const chain = buildChain([], { receivesFromPosition: 9 });
    expect(receivesItem(chain)).toEqual([]);
  });
});
