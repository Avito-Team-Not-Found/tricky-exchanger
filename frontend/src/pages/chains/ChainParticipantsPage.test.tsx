import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmChain,
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
  return {
    ...actual,
    useChain: vi.fn(),
    voteForRequest: vi.fn(),
    withdrawVote: vi.fn(),
    confirmChain: vi.fn(),
  };
});

const mockedUseChain = vi.mocked(useChain);
const mockedVote = vi.mocked(voteForRequest);
const mockedWithdraw = vi.mocked(withdrawVote);
const mockedConfirm = vi.mocked(confirmChain);

const MY_CANDIDATE: ChainParticipant = {
  clusterId: 1,
  requestId: 101,
  position: 0,
  isCurrentUser: true,
  offeredItemId: 1,
  offeredItemTitle: 'Велосипед',
  offeredItemDescription: '',
  wantedDescription: 'Хочу фотоаппарат',
  requestStatus: 'ACTIVE' as const,
};

function makeChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 1,
    status: 'CANDIDATE',
    score: 0.9,
    length: 2,
    version: 1,
    currentRequestId: 101,
    currentPosition: 0,
    givesToPosition: 1,
    receivesFromPosition: 1,
    createdAt: '',
    updatedAt: '',
    participants: [
      MY_CANDIDATE,
      {
        clusterId: 2,
        requestId: 202,
        position: 1,
        isCurrentUser: false,
        offeredItemId: 2,
        offeredItemTitle: 'Зеркальный фотоаппарат Canon',
        offeredItemDescription: 'Полный комплект',
        wantedDescription: 'Хочу велосипед',
        requestStatus: 'ACTIVE' as const,
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
      position: 0,
      isCurrentUser: index === 0,
      offeredItemId: 1,
      offeredItemTitle: `Мой товар ${index + 1}`,
      offeredItemDescription: '',
      wantedDescription: 'Хочу фотоаппарат',
      requestStatus: 'ACTIVE' as const,
    }));
    mockedUseChain.mockReturnValue(
      queryOk(makeChain({ participants: [...pool, makeChain().participants[1]] })),
    );

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('3 варианта')).toBeInTheDocument();
    // пул не получаемого звена сворачивается, а единственный кандидат получаемого звена
    // по-прежнему откликаем — кнопка внизу остаётся одна
    expect(screen.getAllByRole('button', { name: 'Откликнуться' })).toHaveLength(1);
  });

  it('offers a vote on every candidate of the receiving position', () => {
    const pool = [
      {
        clusterId: 2,
        requestId: 202,
        position: 1,
        isCurrentUser: false,
        offeredItemId: 2,
        offeredItemTitle: 'Зеркальный фотоаппарат Canon',
        offeredItemDescription: '',
        wantedDescription: 'Хочу велосипед',
        requestStatus: 'ACTIVE' as const,
      },
      // кандидат без фото: imageUrl с omitempty может отсутствовать вовсе
      {
        clusterId: 2,
        requestId: 203,
        position: 1,
        isCurrentUser: false,
        offeredItemId: 3,
        offeredItemTitle: 'Планшет',
        offeredItemDescription: '',
        wantedDescription: 'Хочу велосипед',
        requestStatus: 'ACTIVE' as const,
      },
    ];
    mockedUseChain.mockReturnValue(queryOk(makeChain({ participants: [MY_CANDIDATE, ...pool] })));

    renderWithProviders(<ChainParticipantsPage />);

    // каждая строка получаемого пула выбираемая, кнопка внизу одна — действует на выбранного
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Откликнуться' })).toHaveLength(1);
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

    await user.click(screen.getAllByRole('radio')[0]);
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

    // статус отклика — пилюля с подписью текстом, чтобы он читался не только по цвету
    expect(screen.getByText('Ожидаем')).toBeInTheDocument();

    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: 'Отозвать отклик' }));
    await user.click(await screen.findByRole('button', { name: 'Да, отозвать' }));

    await waitFor(() =>
      expect(mockedWithdraw).toHaveBeenCalledWith(1, { requestId: 101, targetRequestId: 202 }),
    );
  });

  // на собранной цепочке пилюли первого раунда заменяются голосами второго раунда, а отклики
  // скрыты: у vote на PROPOSED другой смысл
  it('shows second-round confirm pills and hides vote actions on an assembled chain', () => {
    const voted = makeChain({ status: 'PROPOSED' });
    voted.participants[0].vote = 'pending';
    voted.participants[1].vote = 'pending';
    mockedUseChain.mockReturnValue(queryOk(voted));

    renderWithProviders(<ChainParticipantsPage />);

    // оба участника ещё не ответили — обе строки показывают «Ожидает ответа»
    expect(screen.getAllByText('Ожидает ответа')).toHaveLength(2);
    expect(screen.queryByText('Ожидаем')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать отклик' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument();
  });

  // голос привязан к цели голосования: решение участника позиции p лежит в vote позиции p+1
  // по кольцу, поэтому пилюли строятся по сдвигу, а не по полю строки напрямую
  it('renders each confirm vote state on the shifted position', () => {
    const me = { ...MY_CANDIDATE, vote: 'pending' as const };
    const second = { ...makeChain().participants[1], position: 1, vote: 'thinking' as const };
    const third = {
      clusterId: 3,
      requestId: 303,
      position: 2,
      isCurrentUser: false,
      offeredItemId: 3,
      offeredItemTitle: 'Планшет',
      offeredItemDescription: '',
      wantedDescription: 'Хочу велосипед',
      requestStatus: 'ACTIVE' as const,
      vote: 'approved' as const,
    };
    const fourth = {
      clusterId: 4,
      requestId: 404,
      position: 3,
      isCurrentUser: false,
      offeredItemId: 4,
      offeredItemTitle: 'Наушники',
      offeredItemDescription: '',
      wantedDescription: 'Хочу велосипед',
      requestStatus: 'ACTIVE' as const,
      vote: 'rejected' as const,
    };
    mockedUseChain.mockReturnValue(
      queryOk(
        makeChain({
          length: 4,
          currentPosition: 0,
          receivesFromPosition: 1,
          status: 'PROPOSED',
          participants: [me, second, third, fourth],
        }),
      ),
    );

    renderWithProviders(<ChainParticipantsPage />);

    // решение позиции 0 (я) — в vote позиции 1, и так по кольцу
    expect(screen.getAllByText('Думает')).toHaveLength(1);
    expect(screen.getAllByText('Согласился')).toHaveLength(1);
    expect(screen.getAllByText('Отказался')).toHaveLength(1);
    expect(screen.getAllByText('Ожидает ответа')).toHaveLength(1);
  });

  it('marks a vacant position with the released pill', () => {
    const me = { ...MY_CANDIDATE, vote: 'pending' as const };
    const second = { ...makeChain().participants[1], position: 1, vote: 'pending' as const };
    const third = {
      clusterId: 3,
      requestId: 303,
      position: 2,
      isCurrentUser: false,
      offeredItemId: 3,
      offeredItemTitle: 'Планшет',
      offeredItemDescription: '',
      wantedDescription: 'Хочу велосипед',
      requestStatus: 'ACTIVE' as const,
    };
    mockedUseChain.mockReturnValue(
      queryOk(
        makeChain({
          length: 3,
          status: 'PROPOSED',
          participants: [me, second, third],
        }),
      ),
    );

    renderWithProviders(<ChainParticipantsPage />);

    // участник позиции 1 отказался: голос удалён из следующей по кольцу позиции 2
    expect(screen.getByText('Место освободилось')).toBeInTheDocument();
  });

  it('shows the consent badge over the assembled pill', () => {
    const voted = makeChain({ status: 'PROPOSED' });
    voted.participants[0].vote = 'pending';
    voted.participants[1].vote = 'approved';
    mockedUseChain.mockReturnValue(queryOk(voted));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('1/2 согласий')).toBeInTheDocument();
  });

  it('shows M/M consents on a frozen chain', () => {
    const voted = makeChain({ status: 'FROZEN' });
    voted.participants[0].vote = 'approved';
    voted.participants[1].vote = 'approved';
    mockedUseChain.mockReturnValue(queryOk(voted));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('2/2 согласий')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перейти к сделке' })).toBeInTheDocument();
  });

  it('replaces the action with the confirmed line once my vote is approved', () => {
    const voted = makeChain({ status: 'PROPOSED' });
    voted.participants[0].vote = 'pending';
    voted.participants[1].vote = 'approved';
    mockedUseChain.mockReturnValue(queryOk(voted));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('Вы подтвердили · ждём остальных')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Требуются действия' })).not.toBeInTheDocument();
  });

  // на собранной цепочке над списком — пилюля, внизу — подтверждение второго раунда
  it('shows the assembled pill and a confirm action on a PROPOSED chain', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'PROPOSED' })));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('Цепочка собрана')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Требуются действия' })).toBeInTheDocument();
  });

  it('confirms participation from the participants screen', async () => {
    mockedConfirm.mockResolvedValue({ chainId: 1, status: 'PROPOSED' });
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'PROPOSED' })));

    renderWithProviders(<ChainParticipantsPage />);

    await user.click(screen.getByRole('button', { name: 'Требуются действия' }));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith(1));
  });

  it('shows the proceed action on a frozen chain', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'FROZEN' })));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByRole('button', { name: 'Перейти к сделке' })).toBeInTheDocument();
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
