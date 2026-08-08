import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { selectChain, useRequestChains, type Chain } from '@entities/chain';
import { useRequest } from '@entities/exchangeRequest';
import { useItems, type Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainListPage } from './ChainListPage';

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
    useRequestChains: vi.fn(),
    acceptChain: vi.fn(),
    declineChain: vi.fn(),
    selectChain: vi.fn(),
    deselectChain: vi.fn(),
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

const mockedUseRequestChains = vi.mocked(useRequestChains);
const mockedUseRequest = vi.mocked(useRequest);
const mockedUseItems = vi.mocked(useItems);

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

function makeChain(id: string, overrides: Partial<Chain> = {}): Chain {
  return {
    id,
    requestId: 'req-1',
    status: 'CANDIDATE',
    score: 0.72,
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
      canSelect: true,
      canDeselect: false,
      canVote: false,
      canRequestReplacement: false,
    },
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

  it('shows the request summary and the readiness progress of each chain', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseRequestChains.mockReturnValue(queryOk([makeChain('chain-1')]));

    renderWithProviders(<ChainListPage />, {
      routes: [{ path: '/chains/chain-1', element: <div>chain detail</div> }],
    });

    expect(screen.getByText('Варианты обмена')).toBeInTheDocument();
    expect(screen.getByText('Отдаёте: Велосипед')).toBeInTheDocument();
    expect(screen.getByText('Получаете: Хочу фотоаппарат')).toBeInTheDocument();
    // один из двух участников уже согласился
    expect(screen.getByText('1/2 согласий')).toBeInTheDocument();
    // у карточки ровно одна кнопка — выбор цепочки; отклик даётся на детальном экране (макет 4.6)
    expect(screen.getByRole('button', { name: 'Выбрать цепочку' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Требуются действия' })).not.toBeInTheDocument();
  });

  it('opens the chain detail on card click', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseRequestChains.mockReturnValue(queryOk([makeChain('chain-1')]));

    renderWithProviders(<ChainListPage />, {
      routes: [{ path: '/chains/chain-1', element: <div>chain detail</div> }],
    });

    await user.click(screen.getByText('Фотоаппарат'));
    expect(await screen.findByText('chain detail')).toBeInTheDocument();
  });

  it('shows the select action for a fully assembled chain', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    const ready = makeChain('chain-1', {
      participants: [
        {
          position: 1,
          requestId: 'req-1',
          isCurrentUser: true,
          user: { id: 'me', name: 'Я' },
          offeredItem: { id: 'item-1', title: 'Велосипед', imageUrl: null },
          receivesFromPosition: 2,
          responseStatus: 'ACCEPTED',
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
        canRespond: false,
        canSelect: true,
        canDeselect: false,
        canVote: false,
        canRequestReplacement: false,
      },
    });
    mockedUseRequestChains.mockReturnValue(queryOk([ready]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('Цепочка собрана')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать цепочку' })).toBeInTheDocument();
  });

  // выбор не эксклюзивен: отметка одной цепочки не убирает действие с остальных (макет 4.6)
  it('offers the select action on every chain independently', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    const selectable = {
      canRespond: false,
      canSelect: true,
      canDeselect: false,
      canVote: false,
      canRequestReplacement: false,
    };
    mockedUseRequestChains.mockReturnValue(
      queryOk([
        makeChain('chain-1', { viewerPermissions: selectable }),
        // первая цепочка уже отмечена, вторая по-прежнему доступна для выбора
        makeChain('chain-2', {
          status: 'PROPOSED',
          viewerPermissions: { ...selectable, canSelect: false, canDeselect: true },
        }),
        makeChain('chain-3', { viewerPermissions: selectable }),
      ]),
    );

    renderWithProviders(<ChainListPage />);

    expect(screen.getAllByRole('button', { name: 'Выбрать цепочку' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Отменить выбор' })).toHaveLength(1);

    await user.click(screen.getAllByRole('button', { name: 'Выбрать цепочку' })[0]);
    await waitFor(() => expect(vi.mocked(selectChain)).toHaveBeenCalledWith('chain-1'));
  });

  // таймер дедлайна и предупреждение «Примите решение» из карточки убраны (макет 4.6)
  it('renders neither a response timer nor the decision warning', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseRequestChains.mockReturnValue(
      queryOk([makeChain('chain-1', { responseDeadlineAt: '2030-01-01T00:00:00.000Z' })]),
    );

    renderWithProviders(<ChainListPage />);

    expect(screen.queryByText(/на ответ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Примите решение/)).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no chains', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseRequestChains.mockReturnValue(queryOk([]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('Пока нет подходящих цепочек')).toBeInTheDocument();
  });

  it('leads to the request editing screen from the summary block', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseRequestChains.mockReturnValue(queryOk([]));

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
