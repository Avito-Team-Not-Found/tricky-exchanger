import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmChain, useChain, type Chain } from '@entities/chain';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainDetailPage } from './ChainDetailPage';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() } as never;
}

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, useChain: vi.fn(), confirmChain: vi.fn() };
});

const mockedUseChain = vi.mocked(useChain);
const mockedConfirm = vi.mocked(confirmChain);

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
      {
        clusterId: 1,
        requestId: 101,
        position: 1,
        isCurrentUser: true,
        offeredItemId: 1,
        offeredItemTitle: 'Велосипед',
        offeredItemDescription: '',
        wantedDescription: 'Хочу фотоаппарат',
      },
      {
        clusterId: 2,
        requestId: 202,
        position: 2,
        isCurrentUser: false,
        offeredItemId: 2,
        offeredItemTitle: 'Зеркальный фотоаппарат Canon',
        offeredItemDescription: 'Полный комплект: камера, объектив, флешка и чехол',
        wantedDescription: 'Хочу велосипед',
        imageUrl: 'http://localhost:9000/photos/canon.jpg',
      },
    ],
    ...overrides,
  };
}

describe('ChainDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // тесты таймера фиксируют дату через vi.setSystemTime — возвращаем настоящий Date.now()
    vi.useRealTimers();
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
      routes: [{ path: '/chains/1/participants', element: <div>участники</div> }],
    });

    await user.click(screen.getByRole('button', { name: 'Посмотреть всю цепочку' }));
    expect(await screen.findByText('участники')).toBeInTheDocument();
  });

  it('shows the assembled pill once the chain is proposed', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'PROPOSED' })));

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('Цепочка собрана')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Требуются действия' })).toBeInTheDocument();
  });

  it('confirms participation from the chain item view', async () => {
    mockedConfirm.mockResolvedValue({ chainId: 1, status: 'FROZEN' });
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'PROPOSED' })));

    renderWithProviders(<ChainDetailPage />);

    await user.click(screen.getByRole('button', { name: 'Требуются действия' }));
    await user.click(await screen.findByRole('button', { name: 'Да' }));

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith(1));
  });

  it('shows the hard lock plaque and the proceed button on a frozen chain', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'FROZEN' })));

    renderWithProviders(<ChainDetailPage />);

    expect(
      screen.getByText('Товар жёстко заблокирован: изменить или удалить заявку нельзя'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перейти к сделке' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Требуются действия' })).not.toBeInTheDocument();
  });

  it('shows the consent badge with the approved count on a proposed chain', () => {
    const chain = makeChain({ status: 'PROPOSED' });
    chain.participants[0].vote = 'pending';
    chain.participants[1].vote = 'approved';
    mockedUseChain.mockReturnValue(queryOk(chain));

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('1/2 согласий')).toBeInTheDocument();
  });

  it('shows M/M consents on a frozen chain', () => {
    const chain = makeChain({ status: 'FROZEN' });
    chain.participants[0].vote = 'approved';
    chain.participants[1].vote = 'approved';
    mockedUseChain.mockReturnValue(queryOk(chain));

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('2/2 согласий')).toBeInTheDocument();
  });

  // таймер дедлайна ответа — атрибут PROPOSED-цепочки (макет 4.7, TimerRow); на FROZEN то же
  // поле несёт дедлайн отправки товара, поэтому строка гейтится по статусу (DEADLINE-PLAN §1.5)
  it('shows the response deadline on a proposed chain', () => {
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    mockedUseChain.mockReturnValue(
      queryOk(makeChain({ status: 'PROPOSED', freezeDeadlineAt: '2026-08-12T09:58:00Z' })),
    );

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('Осталось 47 ч 58 мин на ответ')).toBeInTheDocument();
  });

  it('hides the deadline row on a frozen chain even when the deadline is set', () => {
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    mockedUseChain.mockReturnValue(
      queryOk(makeChain({ status: 'FROZEN', freezeDeadlineAt: '2026-08-12T09:58:00Z' })),
    );

    renderWithProviders(<ChainDetailPage />);

    expect(screen.queryByText(/Осталось .* на ответ/)).not.toBeInTheDocument();
  });

  it('replaces the action with the confirmed line once my vote is approved', () => {
    const chain = makeChain({ status: 'PROPOSED' });
    chain.participants[0].vote = 'pending';
    chain.participants[1].vote = 'approved';
    mockedUseChain.mockReturnValue(queryOk(chain));

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('Вы подтвердили · ждём остальных')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Требуются действия' })).not.toBeInTheDocument();
  });

  // пул кандидатов может быть больше длины цепочки (§3.1): счётчик участников берём из length,
  // а получаемое звено с несколькими кандидатами деградирует в счётчик вариантов
  it('counts participants by chain length, not by the pool size', () => {
    const pool = Array.from({ length: 5 }, (_, index) => ({
      clusterId: 2,
      requestId: 202 + index,
      position: 2,
      isCurrentUser: false,
      offeredItemId: 20 + index,
      offeredItemTitle: `Фотоаппарат ${index + 1}`,
      offeredItemDescription: '',
      wantedDescription: 'Хочу велосипед',
    }));
    mockedUseChain.mockReturnValue(
      queryOk(makeChain({ participants: [makeChain().participants[0], ...pool] })),
    );

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('2 участника в цепочке')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Получаете: 5 вариантов', level: 2 }),
    ).toBeInTheDocument();
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
