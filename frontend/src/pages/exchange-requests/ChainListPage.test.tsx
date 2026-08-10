import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmChain,
  useChains,
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
    useChains: vi.fn(),
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
const mockedUseRequest = vi.mocked(useRequest);
const mockedUseItems = vi.mocked(useItems);
const mockedVote = vi.mocked(voteForRequest);
const mockedWithdraw = vi.mocked(withdrawVote);
const mockedConfirm = vi.mocked(confirmChain);

// отдаваемый товар заявки (offeredItemId: 1) — деталь заявки его не отдаёт,
// ChainListPage берёт его из кеша товаров
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
    // детали PROPOSED-цепочек подтягиваются для бейджа согласий — по умолчанию без данных
    mockedUseChains.mockReturnValue([]);
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

  it('marks the cards of the chain with the highest score as the best one', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(
      queryOk([makeOptions({ score: 0.55 }), makeOptions({ chainId: 2, score: 0.91 })]),
    );

    renderWithProviders(<ChainListPage />);

    expect(screen.getAllByText('Лучшая цепочка для этого товара')).toHaveLength(2);
  });

  // бэкенд отдаёт цепочки по дате создания — экран обязан показать их по убыванию вероятности
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

  // у заявки чаще всего ровно одна цепочка — плашка должна появляться и на ней
  it('marks the only chain as the best one', () => {
    mockedUseRequest.mockReturnValue(queryOk(request));
    mockedUseOptions.mockReturnValue(queryOk([makeOptions()]));

    renderWithProviders(<ChainListPage />);

    expect(screen.getAllByText('Лучшая цепочка для этого товара')).toHaveLength(2);
  });

  // на собранной цепочке место кнопки отклика занимает подтверждение второго раунда (SOFT-LOCK §5.1)
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

  // сделка по одной из цепочек заморожена: баннер, зелёная кнопка на замороженной карточке,
  // остальные варианты приглушены и недоступны, правка запроса заблокирована (SOFT-LOCK §5.4/§5.5)
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
    expect(screen.getByRole('button', { name: 'Перейти к сделке' })).toBeInTheDocument();
    expect(
      screen.getByText('Товар жёстко заблокирован: изменить или удалить заявку нельзя'),
    ).toBeInTheDocument();

    const dimmedCard = screen
      .getAllByRole('article')
      .find((card) => card.textContent?.includes('Книга'));
    expect(dimmedCard).toHaveAttribute('aria-disabled', 'true');
    expect(dimmedCard).toContainElement(screen.getByRole('button', { name: 'Откликнуться' }));
    expect(screen.getByRole('button', { name: 'Откликнуться' })).toBeDisabled();

    const editButton = screen.getByRole('button', { name: 'Заявка заблокирована сделкой' });
    expect(editButton).toBeDisabled();
  });

  // на замороженной карточке бейдж согласий всегда «M/M» — все участники подтвердили (SOFT-LOCK §5.4)
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

  // на PROPOSED-карточке 4.6 число согласий считается из participants[].vote детали цепочки,
  // которую exchange-options не отдаёт (GET /chains/{id})
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

  // подтвердил — кнопки на карточке сменяются статусной строкой (SOFT-LOCK §5.3)
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

  // когда одна из цепочек замкнулась (PROPOSED, требует подтверждения), остальные варианты
  // приглушены и недоступны — доступной остаётся сама собранная цепочка (SCRUM §2.6)
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

    // собранная цепочка остаётся доступной — действие второго раунда активно
    expect(screen.getByRole('button', { name: 'Требуются действия' })).toBeEnabled();

    const dimmedCard = screen
      .getAllByRole('article')
      .find((card) => card.textContent?.includes('Книга'));
    expect(dimmedCard).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Откликнуться' })).toBeDisabled();
  });

  // при нескольких собранных цепочках они все остаются доступными — приглушаются только кандидатные
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
      .getAllByRole('article')
      .filter(
        (card) =>
          card.textContent?.includes('Фотоаппарат') || card.textContent?.includes('Планшет'),
      );
    for (const card of assembledCards) {
      expect(card).not.toHaveAttribute('aria-disabled');
    }

    const dimmedCard = screen
      .getAllByRole('article')
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
