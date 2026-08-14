import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSearchParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmChain,
  useChains,
  useExchangeOptions,
  useReplacementsForChains,
  voteForRequest,
  withdrawVote,
  type ExchangeOptions,
  type ReplacementOption,
} from '@entities/chain';
import { useRequest } from '@entities/exchangeRequest';
import { useItems, type Item } from '@entities/item';

import { createTestQueryClient, renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainListPage } from './ChainListPage';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() } as never;
}

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return {
    ...actual,
    useExchangeOptions: vi.fn(),
    useChains: vi.fn(),
    useReplacementsForChains: vi.fn(),
    voteForRequest: vi.fn(),
    withdrawVote: vi.fn(),
    confirmChain: vi.fn(),
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
const mockedUseChains = vi.mocked(useChains);
const mockedUseReplacements = vi.mocked(useReplacementsForChains);
const mockedUseRequest = vi.mocked(useRequest);
const mockedUseItems = vi.mocked(useItems);
const mockedVote = vi.mocked(voteForRequest);
const mockedWithdraw = vi.mocked(withdrawVote);
const mockedConfirm = vi.mocked(confirmChain);

function makeReplacement(overrides: Partial<ReplacementOption> = {}): ReplacementOption {
  return {
    requestId: 42,
    offeredItemId: 17,
    title: 'Кофемашина капсульная',
    description: '',
    wantedDescription: 'Ищу фотоаппарат',
    reliability: 0.82,
    respondedAt: '2026-08-09T12:00:00Z',
    ...overrides,
  };
}

// деталь заявки не отдаёт снимок товара — страница берёт его из кеша товаров
const offeredItem = {
  id: 1,
  title: 'Велосипед',
  description: 'Городской',
  category: '',
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
      // кандидат без фото: imageUrl с omitempty может отсутствовать вовсе
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

// целевой экран перехода: показывает, какой вариант получения доехал до цепочки
function OptionProbe() {
  const [searchParams] = useSearchParams();
  return <div>вариант: {searchParams.get('option')}</div>;
}

describe('ChainListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseItems.mockReturnValue(queryOk({ items: [offeredItem], total: 1 }));
    // детали PROPOSED-цепочек подтягиваются для бейджа согласий — по умолчанию без данных
    mockedUseChains.mockReturnValue([]);
    // пулы замен по умолчанию пусты: кнопка замены появляется только у непустого пула
    mockedUseReplacements.mockReturnValue([]);
  });

  afterEach(() => {
    // тесты таймера фиксируют дату через vi.setSystemTime — возвращаем настоящий Date.now()
    vi.useRealTimers();
  });

  it('renders the request summary and one card per receive option', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions()]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('Варианты обмена')).toBeInTheDocument();
    expect(screen.getByText('Отдаёте: Велосипед')).toBeInTheDocument();
    expect(screen.getByText('Получаете: Хочу фотоаппарат')).toBeInTheDocument();
    expect(screen.getAllByText('Фотоаппарат')).toHaveLength(1);
    expect(screen.getByText('Планшет')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Откликнуться' })).toHaveLength(2);
  });

  it('takes the chain length from the response, not from the pool size', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions({ length: 5 })]));

    renderWithProviders(<ChainListPage />);

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

  // экраны цепочки одни на chainId — без варианта получения они развернут звено во весь пул
  it('passes the picked option to the chain detail', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions()]));

    renderWithProviders(<ChainListPage />, {
      routes: [{ path: '/chains/1', element: <OptionProbe /> }],
    });

    await user.click(screen.getByText('Планшет'));
    expect(await screen.findByText('вариант: 203')).toBeInTheDocument();
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

    expect(screen.getAllByText('Средняя · 72%')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать отклик' })).not.toBeInTheDocument();
  });

  it('orders the cards by descending probability, not by the backend order', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    const weak = makeOptions({ score: 0.55 });
    weak.receiveOptions = [{ ...weak.receiveOptions[0], title: 'Слабый вариант' }];
    const strong = makeOptions({ chainId: 2, score: 0.91 });
    strong.receiveOptions = [
      { ...strong.receiveOptions[0], requestId: 303, title: 'Сильный вариант' },
    ];
    mockedUseOptions.mockReturnValue(queryOk([weak, strong]));

    renderWithProviders(<ChainListPage />);

    const titles = screen.getAllByText(/(Сильный|Слабый) вариант/).map((node) => node.textContent);
    expect(titles).toEqual(['Сильный вариант', 'Слабый вариант']);
  });

  it('confirms participation of a PROPOSED chain through the decision modal', async () => {
    mockedConfirm.mockResolvedValue({ chainId: 1, status: 'PROPOSED' });
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions({ status: 'PROPOSED' })]));

    renderWithProviders(<ChainListPage />);

    await user.click(screen.getAllByRole('button', { name: 'Требуются действия' })[0]);
    expect(await screen.findByText('Все участники найдены')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Да' }));
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith(1));
  });

  // непустой пул замен — вакансия: карточка зовёт выбрать замену, а не подтверждать участие
  it('leads to the replacement screen from a card with a non-empty pool', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([
        makeOptions({
          chainId: 1,
          status: 'PROPOSED',
          receiveOptions: [
            {
              clusterId: 2,
              requestId: 202,
              itemId: 2,
              title: 'Фотоаппарат',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
      ]),
    );
    mockedUseReplacements.mockReturnValue([
      { data: [makeReplacement()], isPending: false, isError: false, refetch: vi.fn() } as never,
    ]);

    renderWithProviders(<ChainListPage />, {
      routes: [{ path: '/chains/1/replacement', element: <div>экран замены</div> }],
    });

    expect(screen.queryByRole('button', { name: 'Требуются действия' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Требуется действие' }));
    expect(await screen.findByText('экран замены')).toBeInTheDocument();
  });

  // пустому пулу не место на карточке актора — обычное подтверждение участия остаётся
  it('keeps the confirm action on a card with an empty replacement pool', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions({ status: 'PROPOSED' })]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getAllByRole('button', { name: 'Требуются действия' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Требуется действие' })).not.toBeInTheDocument();
  });

  // на замороженной цепочке остальные варианты приглушены, а правка запроса заблокирована
  it('locks the request once one of its chains is frozen', async () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([
        makeOptions({
          chainId: 1,
          status: 'FROZEN',
          receiveOptions: [
            {
              clusterId: 2,
              requestId: 202,
              itemId: 2,
              title: 'Фотоаппарат',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
        makeOptions({
          chainId: 2,
          receiveOptions: [
            {
              clusterId: 3,
              requestId: 204,
              itemId: 4,
              title: 'Книга',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
      ]),
    );

    renderWithProviders(<ChainListPage />);

    expect(
      screen.getByText(
        'Сделка по одной из цепочек уже согласована. Остальные варианты недоступны.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Требуется действие' })).toBeInTheDocument();

    const dimmedCard = screen
      .getAllByRole('button')
      .find((card) => card.textContent?.includes('Книга'));
    expect(dimmedCard).toHaveAttribute('aria-disabled', 'true');
    expect(dimmedCard).toContainElement(screen.getByRole('button', { name: 'Откликнуться' }));
    expect(screen.getByRole('button', { name: 'Откликнуться' })).toBeDisabled();

    const editButton = screen.getByRole('button', { name: 'Заявка заблокирована сделкой' });
    expect(editButton).toBeDisabled();
  });

  it('shows the M/M consent badge on a frozen chain card', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([
        makeOptions({
          status: 'FROZEN',
          length: 3,
          receiveOptions: [
            {
              clusterId: 2,
              requestId: 202,
              itemId: 2,
              title: 'Фотоаппарат',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
      ]),
    );

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('3/3 согласий')).toBeInTheDocument();
  });

  // число согласий считается по деталям цепочки — exchange-options их не отдаёт
  it('shows the N/M consent badge on a proposed chain from the chain details', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([
        makeOptions({
          status: 'PROPOSED',
          length: 2,
          receiveOptions: [
            {
              clusterId: 2,
              requestId: 202,
              itemId: 2,
              title: 'Фотоаппарат',
              description: '',
              wantedDescription: 'Хочу велосипед',
              vote: 'pending',
            },
          ],
        }),
      ]),
    );
    mockedUseChains.mockReturnValue([
      {
        data: {
          id: 1,
          status: 'PROPOSED',
          length: 2,
          currentPosition: 1,
          receivesFromPosition: 2,
          participants: [
            { position: 1, isCurrentUser: true, vote: 'pending' },
            { position: 2, isCurrentUser: false, vote: 'approved' },
          ],
        },
        isPending: false,
        isError: false,
      },
    ] as never);

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('1/2 согласий')).toBeInTheDocument();
  });

  // дедлайн приходит из детали цепочки — exchange-options его не отдаёт
  it('shows the response deadline on a proposed card from the chain details', () => {
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([
        makeOptions({
          status: 'PROPOSED',
          length: 2,
          receiveOptions: [
            {
              clusterId: 2,
              requestId: 202,
              itemId: 2,
              title: 'Фотоаппарат',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
      ]),
    );
    mockedUseChains.mockReturnValue([
      {
        data: {
          id: 1,
          status: 'PROPOSED',
          length: 2,
          currentPosition: 1,
          receivesFromPosition: 2,
          freezeDeadlineAt: '2026-08-12T09:58:00Z',
          participants: [],
        },
        isPending: false,
        isError: false,
      },
    ] as never);

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('Осталось 47 ч 58 мин на ответ')).toBeInTheDocument();
  });

  // на FROZEN то же поле несёт дедлайн отправки товара
  it('shows the shipping deadline on a frozen card from the chain details', () => {
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([
        makeOptions({
          status: 'FROZEN',
          length: 2,
          receiveOptions: [
            {
              clusterId: 2,
              requestId: 202,
              itemId: 2,
              title: 'Фотоаппарат',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
      ]),
    );
    mockedUseChains.mockReturnValue([
      {
        data: {
          id: 1,
          status: 'FROZEN',
          length: 2,
          currentPosition: 1,
          receivesFromPosition: 2,
          freezeDeadlineAt: '2026-08-12T09:58:00Z',
          participants: [],
        },
        isPending: false,
        isError: false,
      },
    ] as never);

    renderWithProviders(<ChainListPage />);

    expect(screen.getByText('Осталось 47 ч 58 мин на отправку')).toBeInTheDocument();
  });

  // просроченный PROPOSED откатывает только GET /chains/{id} — до перезапроса списка
  // карточка держит живые кнопки и confirm ловит 410
  it('refetches the offer list once the chain detail has expired the proposal', async () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions({ status: 'PROPOSED' })]));
    mockedUseChains.mockReturnValue([
      {
        data: {
          id: 1,
          // деталь уже откатила цепочку, а список всё ещё считает её собранной
          status: 'CANDIDATE',
          length: 2,
          currentPosition: 1,
          receivesFromPosition: 2,
          freezeDeadlineAt: null,
          participants: [],
        },
        isPending: false,
        isError: false,
      },
    ] as never);

    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

    renderWithProviders(<ChainListPage />, { client });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['exchange-options'] }),
    );
  });

  it('hides the deadline row on candidate cards', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions()]));

    renderWithProviders(<ChainListPage />);

    expect(screen.queryByText(/Осталось .* на ответ/)).not.toBeInTheDocument();
  });

  // thinking клиент не выставляет, но по старым данным он приходить может
  it('keeps the action button on a card with a legacy thinking vote', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    const options = makeOptions({ status: 'PROPOSED' });
    options.receiveOptions[0].vote = 'thinking';
    options.receiveOptions[1].vote = 'thinking';
    mockedUseOptions.mockReturnValue(queryOk([options]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getAllByRole('button', { name: 'Требуются действия' })).toHaveLength(2);
    expect(screen.queryByText('⚠ Примите решение как можно скорее!')).not.toBeInTheDocument();
  });

  it('replaces the action with the confirmed line once my vote is approved', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    const options = makeOptions({ status: 'PROPOSED' });
    options.receiveOptions[0].vote = 'approved';
    options.receiveOptions[1].vote = 'approved';
    mockedUseOptions.mockReturnValue(queryOk([options]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getAllByText('Вы подтвердили · ждём остальных')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Требуются действия' })).not.toBeInTheDocument();
  });

  // сама собранная цепочка остаётся доступной, приглушаются только кандидатные
  it('dims candidate chains when one chain is PROPOSED and needs confirmation', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([
        makeOptions({
          chainId: 1,
          status: 'PROPOSED',
          receiveOptions: [
            {
              clusterId: 2,
              requestId: 202,
              itemId: 2,
              title: 'Фотоаппарат',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
        makeOptions({
          chainId: 2,
          receiveOptions: [
            {
              clusterId: 3,
              requestId: 204,
              itemId: 4,
              title: 'Книга',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
      ]),
    );

    renderWithProviders(<ChainListPage />);

    expect(screen.getByRole('button', { name: 'Требуются действия' })).toBeEnabled();

    const dimmedCard = screen
      .getAllByRole('button')
      .find((card) => card.textContent?.includes('Книга'));
    expect(dimmedCard).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Откликнуться' })).toBeDisabled();
  });

  it('keeps several PROPOSED chains available and dims only candidate chains', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([
        makeOptions({
          chainId: 1,
          status: 'PROPOSED',
          receiveOptions: [
            {
              clusterId: 2,
              requestId: 202,
              itemId: 2,
              title: 'Фотоаппарат',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
        makeOptions({
          chainId: 2,
          status: 'PROPOSED',
          receiveOptions: [
            {
              clusterId: 3,
              requestId: 204,
              itemId: 4,
              title: 'Планшет',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
        makeOptions({
          chainId: 3,
          receiveOptions: [
            {
              clusterId: 4,
              requestId: 206,
              itemId: 6,
              title: 'Книга',
              description: '',
              wantedDescription: 'Хочу велосипед',
            },
          ],
        }),
      ]),
    );

    renderWithProviders(<ChainListPage />);

    expect(screen.getAllByRole('button', { name: 'Требуются действия' })).toHaveLength(2);

    const assembledCards = screen
      .getAllByRole('button')
      .filter(
        (card) =>
          card.textContent?.includes('Фотоаппарат') || card.textContent?.includes('Планшет'),
      );
    for (const card of assembledCards) {
      expect(card).not.toHaveAttribute('aria-disabled');
    }

    const dimmedCard = screen
      .getAllByRole('button')
      .find((card) => card.textContent?.includes('Книга'));
    expect(dimmedCard).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Откликнуться' })).toBeDisabled();
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
