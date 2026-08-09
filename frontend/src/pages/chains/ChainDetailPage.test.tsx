import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useChain,
  useIsBestChain,
  useReplacements,
  type Chain,
  type ReplacementOption,
} from '@entities/chain';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainDetailPage } from './ChainDetailPage';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() } as never;
}

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, useChain: vi.fn(), useIsBestChain: vi.fn(), useReplacements: vi.fn() };
});

const mockedUseChain = vi.mocked(useChain);
const mockedUseIsBestChain = vi.mocked(useIsBestChain);
const mockedUseReplacements = vi.mocked(useReplacements);

function mockReplacements(options: ReplacementOption[]) {
  mockedUseReplacements.mockReturnValue({
    data: options,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
}

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
    mockedUseIsBestChain.mockReturnValue({ isBest: false, isLoading: false });
    mockReplacements([]);
  });

  it('shows the best-chain badge when the chain leads the options of its request', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain()));
    mockedUseIsBestChain.mockReturnValue({ isBest: true, isLoading: false });

    renderWithProviders(<ChainDetailPage />);

    expect(screen.getByText('Лучшая цепочка для этого товара')).toBeInTheDocument();
  });

  // иначе плашка появлялась бы после отрисовки и сдвигала вниз уже прочитанное содержимое
  it('keeps the skeleton until the best-chain check resolves', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain()));
    mockedUseIsBestChain.mockReturnValue({ isBest: false, isLoading: true });

    renderWithProviders(<ChainDetailPage />);

    expect(
      screen.queryByRole('heading', { name: 'Зеркальный фотоаппарат Canon', level: 2 }),
    ).not.toBeInTheDocument();
  });

  it('hides the best-chain badge for a chain that does not lead', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain()));

    renderWithProviders(<ChainDetailPage />);

    expect(screen.queryByText('Лучшая цепочка для этого товара')).not.toBeInTheDocument();
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

  // непустой пул замен — единственный признак вакансии: в теле цепочки отказ не виден (TZ §2)
  it('offers to pick a replacement when the pool is not empty', async () => {
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'PROPOSED' })));
    mockReplacements([
      {
        requestId: 42,
        offeredItemId: 17,
        title: 'Кофемашина капсульная',
        description: '',
        wantedDescription: 'Ищу фотоаппарат',
        reliability: 0.82,
        respondedAt: '2026-08-09T12:00:00Z',
      },
    ]);

    renderWithProviders(<ChainDetailPage />, {
      routes: [{ path: '/chains/1/replacement', element: <div>экран замены</div> }],
    });

    expect(
      screen.getByText('Участник отказался. Выберите замену, чтобы продолжить обмен'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Выбрать замену' }));
    expect(await screen.findByText('экран замены')).toBeInTheDocument();
  });

  // выключенный react-query-запрос сохраняет прошлые данные: без проверки статуса баннер
  // «выберите замену» пережил бы подтверждение замены и висел бы на собранной цепочке
  it('drops the replacement banner once the chain leaves PROPOSED', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'FROZEN' })));
    mockReplacements([
      {
        requestId: 42,
        offeredItemId: 17,
        title: 'Кофемашина капсульная',
        description: '',
        wantedDescription: 'Ищу фотоаппарат',
        reliability: 0.82,
        respondedAt: '2026-08-09T12:00:00Z',
      },
    ]);

    renderWithProviders(<ChainDetailPage />);

    expect(screen.queryByRole('button', { name: 'Выбрать замену' })).not.toBeInTheDocument();
  });

  it('leaves a healthy proposed chain without the replacement banner', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain({ status: 'PROPOSED' })));

    renderWithProviders(<ChainDetailPage />);

    expect(screen.queryByRole('button', { name: 'Выбрать замену' })).not.toBeInTheDocument();
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
