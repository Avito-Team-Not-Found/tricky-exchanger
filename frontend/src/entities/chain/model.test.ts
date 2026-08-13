import { describe, expect, it } from 'vitest';

import {
  approvedVotes,
  chainLinks,
  CONFIRM_VOTE_META,
  confirmVoteAt,
  isAssembled,
  isHardLocked,
  myConfirmVote,
  myParticipant,
  needsMyAction,
  needsShipment,
  receivesItem,
  type Chain,
  type ChainParticipant,
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
  requestStatus: 'ACTIVE',
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
  requestStatus: 'ACTIVE',
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

  it('narrows the pool to the requested option', () => {
    const other = { ...OTHER, requestId: 203, offeredItemTitle: 'Планшет' };
    const chain = buildChain([MYSELF, OTHER, other]);
    expect(receivesItem(chain, 203)).toEqual([other]);
  });

  it('falls back to the whole pool when the requested option is gone', () => {
    const chain = buildChain([MYSELF, OTHER]);
    expect(receivesItem(chain, 999)).toEqual([OTHER]);
  });
});

describe('isHardLocked', () => {
  it('locks FROZEN and IN_PROGRESS chains', () => {
    expect(isHardLocked('FROZEN')).toBe(true);
    expect(isHardLocked('IN_PROGRESS')).toBe(true);
    expect(isHardLocked('CANDIDATE')).toBe(false);
    expect(isHardLocked('PROPOSED')).toBe(false);
  });
});

describe('isAssembled', () => {
  it('treats PROPOSED and hard-locked chains as occupying the request', () => {
    expect(isAssembled('PROPOSED')).toBe(true);
    expect(isAssembled('FROZEN')).toBe(true);
    expect(isAssembled('IN_PROGRESS')).toBe(true);
    expect(isAssembled('CANDIDATE')).toBe(false);
    expect(isAssembled('BROKEN')).toBe(false);
    expect(isAssembled('COMPLETED')).toBe(false);
  });
});

describe('needsShipment', () => {
  it('requires shipment only on a frozen chain', () => {
    expect(needsShipment('FROZEN')).toBe(true);
    expect(needsShipment('IN_PROGRESS')).toBe(false);
    expect(needsShipment('COMPLETED')).toBe(false);
    expect(needsShipment('CANDIDATE')).toBe(false);
    expect(needsShipment('PROPOSED')).toBe(false);
  });
});

describe('confirmVoteAt', () => {
  it('reads the vote of the next ring position as the participant decision', () => {
    // позиция 1 (я) и позиция 2 — кольцо длины 2: решение каждой лежит в vote следующей позиции
    const chain = buildChain(
      [
        { ...MYSELF, vote: 'approved' },
        { ...OTHER, vote: 'thinking' },
      ],
      { status: 'PROPOSED' },
    );

    expect(confirmVoteAt(chain, 1)).toBe('thinking');
    expect(confirmVoteAt(chain, 2)).toBe('approved');
  });

  it('returns null for a vacant position whose vote was deleted', () => {
    // участник позиции 2 отказался — его голос удалён из следующей по кольцу позиции (позиция 1)
    const chain = buildChain([{ ...MYSELF }, { ...OTHER, vote: 'pending' }], {
      status: 'PROPOSED',
    });

    expect(confirmVoteAt(chain, 2)).toBeNull();
    expect(confirmVoteAt(chain, 1)).toBe('pending');
  });

  it('returns null when the position is not in the ring', () => {
    const chain = buildChain([MYSELF], { status: 'PROPOSED' });

    expect(confirmVoteAt(chain, 5)).toBeNull();
  });
});

describe('myConfirmVote', () => {
  it('returns my second-round decision from the receiving position', () => {
    const chain = buildChain(
      [
        { ...MYSELF, vote: 'pending' },
        { ...OTHER, vote: 'thinking' },
      ],
      { status: 'PROPOSED' },
    );

    expect(myConfirmVote(chain)).toBe('thinking');
  });
});

describe('approvedVotes', () => {
  it('counts approved second-round votes on an assembled chain', () => {
    const chain = buildChain(
      [
        { ...MYSELF, vote: 'approved' },
        { ...OTHER, vote: 'approved' },
      ],
      { status: 'PROPOSED' },
    );

    expect(approvedVotes(chain)).toBe(2);
  });

  it('counts only approved votes, not thinking or pending', () => {
    const chain = buildChain(
      [
        { ...MYSELF, vote: 'thinking' },
        { ...OTHER, vote: 'approved' },
      ],
      { status: 'PROPOSED' },
    );

    expect(approvedVotes(chain)).toBe(1);
  });

  it('is zero outside PROPOSED/FROZEN where vote means something else', () => {
    const chain = buildChain([
      { ...MYSELF, vote: 'approved' },
      { ...OTHER, vote: 'approved' },
    ]);

    expect(approvedVotes(chain)).toBe(0);
  });
});

describe('needsMyAction', () => {
  it('requires action while my second-round vote is pending', () => {
    const chain = buildChain(
      [
        { ...MYSELF, vote: 'pending' },
        { ...OTHER, vote: 'pending' },
      ],
      { status: 'PROPOSED' },
    );

    expect(needsMyAction(chain)).toBe(true);
  });

  it('requires action while I am still thinking', () => {
    const chain = buildChain(
      [
        { ...MYSELF, vote: 'pending' },
        { ...OTHER, vote: 'thinking' },
      ],
      { status: 'PROPOSED' },
    );

    expect(needsMyAction(chain)).toBe(true);
  });

  it('requires no action once I have confirmed', () => {
    const chain = buildChain(
      [
        { ...MYSELF, vote: 'pending' },
        { ...OTHER, vote: 'approved' },
      ],
      { status: 'PROPOSED' },
    );

    expect(needsMyAction(chain)).toBe(false);
  });

  it('is false outside PROPOSED', () => {
    expect(needsMyAction(buildChain())).toBe(false);
  });
});

describe('CONFIRM_VOTE_META', () => {
  it('defines meta for every second-round vote value', () => {
    expect(Object.keys(CONFIRM_VOTE_META).sort()).toEqual([
      'approved',
      'pending',
      'rejected',
      'thinking',
    ]);
  });
});
