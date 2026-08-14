import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Chain } from '@entities/chain';

import { ChainItemView } from './ChainItemView';

function baseChain(): Chain {
  return {
    id: 1,
    status: 'PROPOSED',
    score: 0.8,
    length: 2,
    version: 1,
    currentRequestId: 10,
    currentPosition: 0,
    givesToPosition: 1,
    receivesFromPosition: 1,
    freezeDeadlineAt: null,
    invalidReason: null,
    createdAt: '2026-08-10T10:00:00Z',
    updatedAt: '2026-08-10T10:00:00Z',
    participants: [
      {
        clusterId: 1,
        requestId: 10,
        position: 0,
        isCurrentUser: true,
        offeredItemId: 100,
        offeredItemTitle: 'Моя книга',
        offeredItemDescription: 'Описание',
        wantedDescription: 'Хочу',
        imageUrl: null,
        requestStatus: 'LOCKED',
      },
      {
        clusterId: 1,
        requestId: 11,
        position: 1,
        isCurrentUser: false,
        offeredItemId: 200,
        offeredItemTitle: 'Чужой товар',
        offeredItemDescription: 'Другое описание',
        wantedDescription: 'Хочу',
        imageUrl: null,
        requestStatus: 'LOCKED',
      },
    ],
  };
}

function renderChain(chain: Chain) {
  const onDecline = vi.fn();
  render(
    <ChainItemView
      chain={chain}
      isVoting={false}
      onVote={vi.fn()}
      onOpenParticipants={vi.fn()}
      onConfirm={vi.fn()}
      onProceed={vi.fn()}
      onReplace={vi.fn()}
      onDecline={onDecline}
    />,
  );
  return { onDecline };
}

describe('ChainItemView', () => {
  it('shows the decline button on a confirmed proposed chain', () => {
    const chain = baseChain();
    // решение по позиции 0 лежит в vote участника следующей позиции
    chain.participants[1].vote = 'approved';

    renderChain(chain);

    expect(screen.getByText('Вы подтвердили · ждём остальных')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отказаться от сделки' })).toBeInTheDocument();
  });

  it('declines the deal when the confirmed-chain button is clicked', async () => {
    const user = userEvent.setup();
    const chain = baseChain();
    chain.participants[1].vote = 'approved';

    const { onDecline } = renderChain(chain);
    await user.click(screen.getByRole('button', { name: 'Отказаться от сделки' }));

    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('hides the decline button before I confirm on a proposed chain', () => {
    const chain = baseChain();
    chain.participants[1].vote = 'pending';

    renderChain(chain);

    expect(screen.getByRole('button', { name: 'Требуются действия' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отказаться от сделки' })).not.toBeInTheDocument();
  });

  it('shows the score badge while the probability still matters', () => {
    renderChain(baseChain());

    expect(screen.getByText('Высокая · 80%')).toBeInTheDocument();
  });

  it('hides the score badge on an in-progress chain', () => {
    const chain = baseChain();
    chain.status = 'IN_PROGRESS';

    renderChain(chain);

    expect(screen.queryByText('Высокая · 80%')).not.toBeInTheDocument();
  });

  it('hides the score badge on a completed chain', () => {
    const chain = baseChain();
    chain.status = 'COMPLETED';

    renderChain(chain);

    expect(screen.queryByText('Высокая · 80%')).not.toBeInTheDocument();
  });

  it('hides the score badge on a broken chain', () => {
    const chain = baseChain();
    chain.status = 'BROKEN';

    renderChain(chain);

    expect(screen.queryByText('Высокая · 80%')).not.toBeInTheDocument();
  });
});
