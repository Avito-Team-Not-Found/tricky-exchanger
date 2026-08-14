import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmChain, useChain, type Chain, type ChainParticipant } from '@entities/chain';

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
    confirmChain: vi.fn(),
  };
});

const mockedUseChain = vi.mocked(useChain);
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
    expect(screen.getByText('Зеркальный фотоаппарат Canon')).toBeInTheDocument();
  });

  it('shows all candidates of the receiving position', () => {
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

    expect(screen.getByText('Зеркальный фотоаппарат Canon')).toBeInTheDocument();
    expect(screen.getByText('Планшет')).toBeInTheDocument();
  });

  // пул получаемого звена — заявки разных людей, поэтому по ссылке показываем только выбранную
  it('keeps only the selected option on the receiving link', () => {
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

    renderWithProviders(<ChainParticipantsPage />, {
      initialEntries: ['/chains/1/participants?option=203'],
    });

    expect(screen.getByText('Планшет')).toBeInTheDocument();
    expect(screen.queryByText('Зеркальный фотоаппарат Canon')).not.toBeInTheDocument();
  });

  it('shows the vote status of a responded candidate', () => {
    const voted = makeChain();
    voted.participants[1].vote = 'pending';
    mockedUseChain.mockReturnValue(queryOk(voted));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('Ожидаем')).toBeInTheDocument();
  });

  // у vote на PROPOSED другой смысл, поэтому отклики первого раунда скрыты
  it('shows second-round confirm pills and hides vote actions on an assembled chain', () => {
    const voted = makeChain({ status: 'PROPOSED' });
    voted.participants[0].vote = 'pending';
    voted.participants[1].vote = 'pending';
    mockedUseChain.mockReturnValue(queryOk(voted));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getAllByText('Ожидает ответа')).toHaveLength(2);
    expect(screen.queryByText('Ожидаем')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать отклик' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument();
  });

  // голос привязан к цели: решение позиции p лежит в vote позиции p+1 по кольцу
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

  it('shows the score badge and a confirm action on a PROPOSED chain', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'PROPOSED' })));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.getByText('Высокая · 90%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Требуются действия' })).toBeInTheDocument();
  });

  it('shows only the consents badge on an in-progress chain', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'IN_PROGRESS' })));

    renderWithProviders(<ChainParticipantsPage />);

    expect(screen.queryByText('Высокая · 90%')).not.toBeInTheDocument();
    expect(screen.getByText('0/2 согласий')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перейти к сделке' })).toBeInTheDocument();
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
