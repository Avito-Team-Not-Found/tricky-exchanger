import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChain, type Chain } from '@entities/chain';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainDetailPage } from './ChainDetailPage';

// раздел цепочек включается флагом — в тестах он активен, чтобы код не сгнил до Chains API
vi.mock('@shared/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:8080' },
  isDev: true,
  featureChainsEnabled: true,
}));

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() } as never;
}

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, useChain: vi.fn() };
});

const mockedUseChain = vi.mocked(useChain);

function makeChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 'chain-1',
    requestId: 'req-1',
    status: 'CANDIDATE',
    score: 0.9,
    responseDeadlineAt: null,
    freezeDeadlineAt: null,
    participants: [
      {
        position: 1,
        requestId: 'req-1',
        isCurrentUser: true,
        user: { id: 'me', name: 'Я' },
        offeredItem: { id: 'item-1', title: 'Велосипед', imageUrl: null },
        receivesFromPosition: 2,
        responseStatus: null,
        freezeVoteStatus: null,
      },
      {
        position: 2,
        requestId: null,
        isCurrentUser: false,
        user: { id: 'u2', name: 'Мария' },
        offeredItem: {
          id: 'item-2',
          title: 'Зеркальный фотоаппарат Canon',
          imageUrl: null,
          description: 'Полный комплект: камера, объектив, флешка и чехол',
          categoryId: 3,
        },
        receivesFromPosition: 1,
        responseStatus: 'ACCEPTED',
        freezeVoteStatus: null,
      },
    ],
    viewerPermissions: {
      canRespond: true,
      canSelect: false,
      canDeselect: false,
      canVote: false,
      canRequestReplacement: false,
    },
    ...overrides,
  };
}

describe('ChainDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the received item with its description', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain()));

    renderWithProviders(<ChainDetailPage />);

    expect(
      screen.getByRole('heading', { name: 'Зеркальный фотоаппарат Canon', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 участника в цепочке')).toBeInTheDocument();
    expect(
      screen.getByText('Полный комплект: камера, объектив, флешка и чехол'),
    ).toBeInTheDocument();
  });

  it('opens the participants screen on button click', async () => {
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeChain()));

    renderWithProviders(<ChainDetailPage />, {
      routes: [{ path: '/chains/chain-1/participants', element: <div>участники</div> }],
    });

    await user.click(screen.getByRole('button', { name: 'Посмотреть всю цепочку' }));
    expect(await screen.findByText('участники')).toBeInTheDocument();
  });

  it('shows the assembled pill when every participant agreed', () => {
    const ready = makeChain({
      participants: makeChain().participants.map((p) => ({ ...p, responseStatus: 'ACCEPTED' })),
    });
    mockedUseChain.mockReturnValue(queryOk(ready));

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('Цепочка собрана')).toBeInTheDocument();
  });

  it('shows an error state with retry when the chain fails to load', async () => {
    const refetch = vi.fn();
    mockedUseChain.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as never);

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Повторить попытку' }));
    expect(refetch).toHaveBeenCalled();
  });
});
