import { describe, expect, it } from 'vitest';

import {
  chainReadiness,
  myParticipant,
  receivesItem,
  type Chain,
  type ChainParticipant,
} from './model';

const MYSELF: ChainParticipant = {
  position: 1,
  requestId: 'req-1',
  isCurrentUser: true,
  user: { id: 'me', name: 'Я' },
  offeredItem: { id: 'item-1', title: 'Велосипед', imageUrl: null },
  receivesFromPosition: 2,
  responseStatus: null,
  freezeVoteStatus: null,
};

const OTHER: ChainParticipant = {
  position: 2,
  requestId: 'req-2',
  isCurrentUser: false,
  user: { id: 'other', name: 'Мария' },
  offeredItem: { id: 'item-2', title: 'Фотоаппарат', imageUrl: null },
  receivesFromPosition: 1,
  responseStatus: 'ACCEPTED',
  freezeVoteStatus: null,
};

function buildChain(participants = [MYSELF, OTHER]): Chain {
  return {
    id: 'chain-1',
    requestId: 'req-1',
    status: 'CANDIDATE',
    score: 0.72,
    responseDeadlineAt: null,
    freezeDeadlineAt: null,
    participants,
    viewerPermissions: {
      canRespond: false,
      canSelect: false,
      canDeselect: false,
      canVote: false,
      canRequestReplacement: false,
    },
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

describe('chainReadiness', () => {
  it('counts accepted participants out of the total', () => {
    expect(chainReadiness(buildChain())).toEqual({ agreed: 1, total: 2 });
  });

  it('reports zero agreed when nobody responded yet', () => {
    const chain = buildChain([
      { ...MYSELF, responseStatus: null },
      { ...OTHER, responseStatus: null },
    ]);
    expect(chainReadiness(chain)).toEqual({ agreed: 0, total: 2 });
  });
});

describe('receivesItem', () => {
  it('resolves the item the participant gets from the receiving position', () => {
    const chain = buildChain();
    expect(receivesItem(MYSELF, chain)).toEqual(OTHER.offeredItem);
  });

  it('returns null when the receiving position is missing', () => {
    const chain = buildChain();
    expect(receivesItem({ ...MYSELF, receivesFromPosition: 9 }, chain)).toBeNull();
  });
});
