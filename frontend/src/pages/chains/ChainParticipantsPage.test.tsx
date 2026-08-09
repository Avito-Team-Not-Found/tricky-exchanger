import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useChain,
  voteForRequest,
  withdrawVote,
  type Chain,
  type ChainParticipant,
} from '@entities/chain';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainParticipantsPage } from './ChainParticipantsPage';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() } as never;
}

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, useChain: vi.fn(), voteForRequest: vi.fn(), withdrawVote: vi.fn() };
});

const mockedUseChain = vi.mocked(useChain);
const mockedVote = vi.mocked(voteForRequest);
const mockedWithdraw = vi.mocked(withdrawVote);

const MY_CANDIDATE: ChainParticipant = {
  clusterId: 1,
  requestId: 101,
  position: 1,
  isCurrentUser: true,
  offeredItemId: 1,
  offeredItemTitle: 'Велосипед',
  offeredItemDescription: '',
  wantedDescription: 'Хочу фотоаппарат',
};

function makeChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 1,
    status: 'CANDIDATE',
    score: 0.9,
    length: 2,
    version: 1,
    currentRequestId: 101,
    currentPosition: 1,
    givesToPosition: 2,
    receivesFromPosition: 2,
    createdAt: '',
    updatedAt: '',
    participants: [
      MY_CANDIDATE,
      {
        clusterId: 2,
        requestId: 202,
        position: 2,
        isCurrentUser: false,
        offeredItemId: 2,
        offeredItemTitle: 'Зеркальный фотоаппарат Canon',
        offeredItemDescription: 'Полный комплект',
        wantedDescription: 'Хочу велосипед',
      },
    ],
    ...overrides,
  };
}

describe('ChainParticipantsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the chain as links with position aliases and candidate items', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain()));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('Вы')).toBeInTheDocument();
    // настоящие имена участников не показываются — только псевдоним по позиции в цепочке
    expect(screen.getByText('Лиса')).toBeInTheDocument();
    expect(screen.getByText('Зеркальный фотоаппарат Canon')).toBeInTheDocument();
    expect(screen.getByText('Хочет: Хочу велосипед')).toBeInTheDocument();
  });

  it('collapses a non-receiving pool into a variants counter', () => {
    const pool = Array.from({ length: 3 }, (_, index) => ({
      clusterId: 1,
      requestId: 101 + index,
      position: 1,
      isCurrentUser: index === 0,
      offeredItemId: 1,
      offeredItemTitle: `Мой товар ${index + 1}`,
      offeredItemDescription: '',
      wantedDescription: 'Хочу фотоаппарат',
    }));
    mockedUseChain.mockReturnValue(
      queryOk(makeChain({ participants: [...pool, makeChain().participants[1]] })),
    );

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('3 варианта')).toBeInTheDocument();
    // пул не получаемого звена сворачивается, а единственный кандидат получаемого звена
    // по-прежнему откликаем — кнопка остаётся одна
    expect(screen.getAllByRole('button', { name: 'Откликнуться' })).toHaveLength(1);
  });

  it('offers a vote on every candidate of the receiving position', () => {
    const pool = [
      {
        clusterId: 2,
        requestId: 202,
        position: 2,
        isCurrentUser: false,
        offeredItemId: 2,
        offeredItemTitle: 'Зеркальный фотоаппарат Canon',
        offeredItemDescription: '',
        wantedDescription: 'Хочу велосипед',
      },
      // кандидат без фото: imageUrl с omitempty может отсутствовать вовсе (PROJECT.md §4.4)
      {
        clusterId: 2,
        requestId: 203,
        position: 2,
        isCurrentUser: false,
        offeredItemId: 3,
        offeredItemTitle: 'Планшет',
        offeredItemDescription: '',
        wantedDescription: 'Хочу велосипед',
      },
    ];
    mockedUseChain.mockReturnValue(queryOk(makeChain({ participants: [MY_CANDIDATE, ...pool] })));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getAllByRole('button', { name: 'Откликнуться' })).toHaveLength(2);
  });

  it('casts a vote for the concrete candidate', async () => {
    mockedVote.mockResolvedValue({
      chainId: 1,
      requestId: 101,
      targetRequestId: 202,
      vote: 'pending',
      votedAt: '2026-08-08T12:00:00Z',
      chainStatus: 'CANDIDATE',
    });
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeChain()));

    renderWithProviders(<ChainParticipantsPage />);

    await user.click(screen.getByRole('button', { name: 'Откликнуться' }));
    await waitFor(() =>
      expect(mockedVote).toHaveBeenCalledWith(1, { requestId: 101, targetRequestId: 202 }),
    );
  });

  it('shows the vote status and withdraws it through the confirmation modal', async () => {
    mockedWithdraw.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const voted = makeChain();
    voted.participants[1].vote = 'pending';
    mockedUseChain.mockReturnValue(queryOk(voted));

    renderWithProviders(<ChainParticipantsPage />);

    // статус отклика — пилюля с глифом, чтобы он читался не только по цвету (макет 4.8)
    expect(screen.getByText('⏳ Отклик отправлен')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отозвать отклик' }));
    await user.click(await screen.findByRole('button', { name: 'Да, отозвать' }));

    await waitFor(() =>
      expect(mockedWithdraw).toHaveBeenCalledWith(1, { requestId: 101, targetRequestId: 202 }),
    );
  });

  // после замыкания кольца откликов цепочку переводит в PROPOSED сам бэкенд: статус отклика
  // на получаемом кандидате остаётся, но отзыв/отклик уже не доступны — DELETE у non-CANDIDATE даёт 409
  it('keeps the vote pill but hides the vote action on an assembled chain', () => {
    const voted = makeChain({ status: 'PROPOSED' });
    voted.participants[1].vote = 'pending';
    mockedUseChain.mockReturnValue(queryOk(voted));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('⏳ Отклик отправлен')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать отклик' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument();
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
