import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Chain } from '@entities/chain';

import { ParticipantStatusList } from './ParticipantStatusList';

function makeChain(): Chain {
  return {
    id: 1,
    status: 'IN_PROGRESS',
    score: 0.9,
    length: 2,
    version: 1,
    currentRequestId: 101,
    currentPosition: 0,
    givesToPosition: 0,
    receivesFromPosition: 1,
    createdAt: '',
    updatedAt: '',
    participants: [
      {
        clusterId: 1,
        requestId: 101,
        position: 0,
        isCurrentUser: true,
        offeredItemId: 1,
        offeredItemTitle: 'Мой товар',
        offeredItemDescription: '',
        wantedDescription: 'Хочу их товар',
        requestStatus: 'IN_PROGRESS',
      },
      {
        clusterId: 2,
        requestId: 202,
        position: 1,
        isCurrentUser: false,
        offeredItemId: 2,
        offeredItemTitle: 'Их товар',
        offeredItemDescription: '',
        wantedDescription: 'Хочу мой товар',
        requestStatus: 'IN_PROGRESS',
      },
    ],
  };
}

// рендер без QueryClientProvider: список — чистый рендер данных цепочки, серверных запросов нет
function renderList(chain: Chain, mode: 'shipments' | 'receipts') {
  return render(<ParticipantStatusList chain={chain} mode={mode} />);
}

describe('ParticipantStatusList', () => {
  it('shows aliases instead of real names', () => {
    renderList(makeChain(), 'shipments');

    expect(screen.getByText('Вы')).toBeInTheDocument();
    // участник позиции 1 — Лиса, реальное имя нигде не показывается
    expect(screen.getByText('Лиса')).toBeInTheDocument();
    expect(screen.queryByText('Алексей')).not.toBeInTheDocument();
  });

  it('labels shipments by the participant request status', () => {
    const chain = makeChain();
    chain.participants[0].requestStatus = 'LOCKED';
    chain.participants[1].requestStatus = 'IN_PROGRESS';

    renderList(chain, 'shipments');

    expect(screen.getByText('Ожидает отправки')).toBeInTheDocument();
    expect(screen.getByText('Отправлено')).toBeInTheDocument();
  });

  it('labels receipts by the source request status', () => {
    const chain = makeChain();
    // источник моей позиции (позиция 1) уже DONE — я получил товар
    chain.participants[1].requestStatus = 'DONE';

    renderList(chain, 'receipts');

    expect(screen.getByText('Получил')).toBeInTheDocument();
    expect(screen.getByText('Ожидаем')).toBeInTheDocument();
  });

  it('draws the swap line as give → receive', () => {
    renderList(makeChain(), 'shipments');

    expect(screen.getByText('Мой товар → Их товар')).toBeInTheDocument();
    expect(screen.getByText('Их товар → Мой товар')).toBeInTheDocument();
  });

  it('highlights the current user row', () => {
    const { container } = renderList(makeChain(), 'shipments');

    const rows = container.querySelectorAll('.participant-status__row');
    expect(rows[0].className).toContain('participant-status__row--me');
    expect(rows[1].className).not.toContain('participant-status__row--me');
  });
});
