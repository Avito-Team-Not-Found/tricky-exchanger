import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChain, type Chain } from '@entities/chain';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainParticipantsPage } from './ChainParticipantsPage';

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
  return {
    ...actual,
    useChain: vi.fn(),
    acceptChain: vi.fn(),
    declineChain: vi.fn(),
    selectChain: vi.fn(),
    deselectChain: vi.fn(),
  };
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
        offeredItem: { id: 'item-2', title: 'Фотоаппарат', imageUrl: null },
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

describe('ChainParticipantsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows participants with their response statuses', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain()));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('Вы')).toBeInTheDocument();
    // настоящее имя участника не показывается — только псевдоним по позиции в цепочке
    expect(screen.queryByText('Мария')).not.toBeInTheDocument();
    expect(screen.getByText('Лиса')).toBeInTheDocument();
    // статус отклика — пилюля с глифом, чтобы он читался не только по цвету (макет 4.8)
    expect(screen.getByText('✓ Согласился')).toBeInTheDocument();
    expect(screen.getByText('⏳ Ожидает ответа')).toBeInTheDocument();
    expect(screen.getByText('1/2 согласий')).toBeInTheDocument();
  });

  it('offers accept and decline when the user can respond', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain()));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByRole('button', { name: 'Принять участие' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отказаться' })).toBeInTheDocument();
  });

  it('offers chain selection once it is fully assembled', () => {
    const ready = makeChain({
      participants: makeChain().participants.map((p) => ({ ...p, responseStatus: 'ACCEPTED' })),
      viewerPermissions: {
        canRespond: false,
        canSelect: true,
        canDeselect: false,
        canVote: false,
        canRequestReplacement: false,
      },
    });
    mockedUseChain.mockReturnValue(queryOk(ready));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('Цепочка собрана')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать цепочку' })).toBeInTheDocument();
  });

  // выбор обратим: у уже выбранной цепочки та же кнопка предлагает его отменить
  it('offers cancelling the selection of an already selected chain', () => {
    const selected = makeChain({
      status: 'PROPOSED',
      viewerPermissions: {
        canRespond: false,
        canSelect: false,
        canDeselect: true,
        canVote: false,
        canRequestReplacement: false,
      },
    });
    mockedUseChain.mockReturnValue(queryOk(selected));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByRole('button', { name: 'Отменить выбор' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выбрать цепочку' })).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the chain fails to load', async () => {
    const refetch = vi.fn();
    mockedUseChain.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as never);

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Повторить попытку' }));
    expect(refetch).toHaveBeenCalled();
  });
});
