import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useExchangeOptions,
  voteForRequest,
  withdrawVote,
  type ExchangeOptions,
} from '@entities/chain';
import { useRequest } from '@entities/exchangeRequest';
import { useItems, type Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainListPage } from './ChainListPage';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() } as never;
}

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return {
    ...actual,
    useExchangeOptions: vi.fn(),
    voteForRequest: vi.fn(),
    withdrawVote: vi.fn(),
  };
});

vi.mock('@entities/exchangeRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/exchangeRequest')>();
  return { ...actual, useRequest: vi.fn() };
});

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, useItems: vi.fn() };
});

const mockedUseOptions = vi.mocked(useExchangeOptions);
const mockedUseRequest = vi.mocked(useRequest);
const mockedUseItems = vi.mocked(useItems);
const mockedVote = vi.mocked(voteForRequest);
const mockedWithdraw = vi.mocked(withdrawVote);

// отдаваемый товар заявки (offeredItemId: 1) — деталь заявки его не отдаёт,
// ChainListPage берёт его из кеша товаров
const offeredItem = {
  id: 1,
  title: 'Велосипед',
  description: 'Городской',
  categoryId: null,
  imageUrl: null,
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
} as Item;

function makeOptions(overrides: Partial<ExchangeOptions> = {}): ExchangeOptions {
  return {
    chainId: 1,
    status: 'CANDIDATE',
    score: 0.72,
    length: 3,
    currentRequestId: 101,
    currentPosition: 1,
    givesToPosition: 3,
    receivesFromPosition: 2,
    currentOffer: {
      clusterId: 1,
      requestId: 101,
      itemId: 1,
      title: 'Велосипед',
      description: '',
      wantedDescription: 'Хочу фотоаппарат',
    },
    receiveOptions: [
      {
        clusterId: 2,
        requestId: 202,
        itemId: 2,
        title: 'Фотоаппарат',
        description: 'Полный комплект',
        wantedDescription: 'Хочу велосипед',
        imageUrl: 'http://localhost:9000/photos/camera.jpg',
      },
      // кандидат без фото: imageUrl с omitempty может отсутствовать вовсе (PROJECT.md §4.4)
      {
        clusterId: 2,
        requestId: 203,
        itemId: 3,
        title: 'Планшет',
        description: '',
        wantedDescription: 'Хочу велосипед',
      },
    ],
    ...overrides,
  };
}

const request = {
  id: 1,
  status: 'IN_PROPOSAL',
  offeredItemId: 1,
  wantedDescription: 'Хочу фотоаппарат',
  version: 1,
  createdAt: '',
  updatedAt: '',
} as never;

describe('ChainListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseItems.mockReturnValue(queryOk({ items: [offeredItem], total: 1 }));
  });

  it('renders the request summary and one card per receive option', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions()]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('Варианты обмена')).toBeInTheDocument();
    expect(screen.getByText('Отдаёте: Велосипед')).toBeInTheDocument();
    expect(screen.getByText('Получаете: Хочу фотоаппарат')).toBeInTheDocument();
    // два кандидата следующего звена — две карточки, у обеих есть кнопка отклика
    expect(screen.getAllByText('Фотоаппарат')).toHaveLength(1);
    expect(screen.getByText('Планшет')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Откликнуться' })).toHaveLength(2);
  });

  // длина цепочки — отдельное значение (chain.length), а не размер пула receiveOptions (§3.4)
  it('takes the chain length from the response, not from the pool size', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions({ length: 5 })]));

    renderWithProviders(<ChainListPage />);

    // у каждого из двух вариантов своя карточка со своим счётчиком
    expect(screen.getAllByText('5 участников')).toHaveLength(2);
  });

  it('opens the chain detail on card click', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions()]));

    renderWithProviders(<ChainListPage />, {
      routes: [{ path: '/chains/1', element: <div>chain detail</div> }],
    });

    await user.click(screen.getByText('Фотоаппарат'));
    expect(await screen.findByText('chain detail')).toBeInTheDocument();
  });

  it('casts a vote for the concrete candidate without a confirmation', async () => {
    mockedVote.mockResolvedValue({
      chainId: 1,
      requestId: 101,
      targetRequestId: 202,
      vote: 'pending',
      votedAt: '2026-08-08T12:00:00Z',
      chainStatus: 'CANDIDATE',
    });
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions()]));

    renderWithProviders(<ChainListPage />);

    await user.click(screen.getAllByRole('button', { name: 'Откликнуться' })[0]);
    await waitFor(() =>
      expect(mockedVote).toHaveBeenCalledWith(1, { requestId: 101, targetRequestId: 202 }),
    );
  });

  it('withdraws an existing vote only through the confirmation modal', async () => {
    mockedWithdraw.mockResolvedValue(undefined);
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    const options = makeOptions();
    options.receiveOptions[0].vote = 'pending';
    mockedUseOptions.mockReturnValue(queryOk([options]));

    renderWithProviders(<ChainListPage />);

    await user.click(screen.getByRole('button', { name: 'Отозвать отклик' }));
    await user.click(await screen.findByRole('button', { name: 'Да, отозвать' }));

    await waitFor(() =>
      expect(mockedWithdraw).toHaveBeenCalledWith(1, { requestId: 101, targetRequestId: 202 }),
    );
  });

  it('hides the vote action on an assembled chain', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions({ status: 'PROPOSED' })]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getAllByText('Цепочка собрана')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать отклик' })).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no exchange options', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('Пока нет подходящих цепочек')).toBeInTheDocument();
  });

  it('leads to the request editing screen from the summary block', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([]));

    // ChainListPage рендерится под реальным путём, чтобы useParams вернул requestId
    renderWithProviders(<div>stub</div>, {
      initialEntries: ['/exchange-requests/1'],
      routes: [
        { path: '/exchange-requests/:requestId', element: <ChainListPage /> },
        { path: '/exchange-requests/1/edit', element: <div>edit screen</div> },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Редактировать запрос' }));
    expect(await screen.findByText('edit screen')).toBeInTheDocument();
  });
});
