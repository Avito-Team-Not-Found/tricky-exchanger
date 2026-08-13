import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRequest,
  removeRequest,
  useRequest,
  type ExchangeRequest,
} from '@entities/exchangeRequest';
import { useItems, type Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { RequestForm } from './RequestForm';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

vi.mock('@entities/exchangeRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/exchangeRequest')>();
  return {
    ...actual,
    createRequest: vi.fn(),
    updateRequest: vi.fn(),
    removeRequest: vi.fn(),
    useRequest: vi.fn(),
  };
});

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, useItems: vi.fn() };
});

const mockedCreateRequest = vi.mocked(createRequest);
const mockedRemoveRequest = vi.mocked(removeRequest);
const mockedUseRequest = vi.mocked(useRequest);
const mockedUseItems = vi.mocked(useItems);

const LONG_WANTED = 'Ноутбук в рабочем состоянии, любой диагонали, можно без зарядки';

const items = [
  {
    id: 1,
    title: 'Кухонный комбайн',
    description: 'Мощный',
    category: '',
    imageUrl: null,
    status: 'ACTIVE',
  },
  {
    id: 2,
    title: 'Велосипед',
    description: 'Городской',
    category: '',
    imageUrl: 'bike.png',
    status: 'UNAVAILABLE',
  },
  {
    id: 3,
    title: 'Гитара',
    description: 'Акустическая',
    category: '',
    imageUrl: null,
    status: 'ARCHIVED',
  },
] as unknown as Item[];

const lockedRequest = {
  id: 1,
  status: 'LOCKED',
  offeredItemId: 1,
  offeredItemTitle: 'Кухонный комбайн',
  wantedDescription: 'Ноутбук',
  version: 1,
  createdAt: '',
  updatedAt: '',
} as ExchangeRequest;

const liveRequest = { ...lockedRequest, status: 'ACTIVE' } as ExchangeRequest;

async function pickCategory(user: ReturnType<typeof userEvent.setup>, name = 'Ноутбуки') {
  await user.click(screen.getByLabelText('Категория'));
  await user.type(screen.getByLabelText('Категория'), name);
  await user.click(await screen.findByTitle(name));
}

async function fillWanted(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Что вы хотите получить'), LONG_WANTED);
  await pickCategory(user);
}

describe('RequestForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseItems.mockReturnValue(queryOk({ items, total: items.length }));
    mockedUseRequest.mockReturnValue(queryOk(undefined));
  });

  it('shows the search result with zero candidate chains and keeps the request searchable', async () => {
    const user = userEvent.setup();
    mockedCreateRequest.mockResolvedValue({
      id: 2,
      status: 'ACTIVE',
      offeredItemId: 1,
      offeredItemTitle: 'Кухонный комбайн',
      wantedDescription: 'Ноутбук',
      version: 1,
      createdAt: '',
      updatedAt: '',
    } as ExchangeRequest);
    renderWithProviders(<RequestForm />);

    await user.click(screen.getByText('Кухонный комбайн'));
    await fillWanted(user);
    await user.click(screen.getByRole('button', { name: /Создать запрос/ }));

    expect(
      await screen.findByText('Пока подходящих цепочек нет — заявка остаётся в поиске.'),
    ).toBeInTheDocument();
    expect(mockedCreateRequest).toHaveBeenCalledWith({
      offeredItemId: 1,
      wantedDescription: LONG_WANTED,
      wantedCategory: 'Ноутбуки',
    });
  });

  it('leads to the requests list from the search result', async () => {
    const user = userEvent.setup();
    mockedCreateRequest.mockResolvedValue({
      id: 2,
      status: 'ACTIVE',
      offeredItemId: 1,
      offeredItemTitle: 'Кухонный комбайн',
      wantedDescription: 'Ноутбук',
      version: 1,
      createdAt: '',
      updatedAt: '',
    } as ExchangeRequest);
    renderWithProviders(<RequestForm />, {
      routes: [{ path: '/exchange-requests', element: <div>requests screen</div> }],
    });

    await user.click(screen.getByText('Кухонный комбайн'));
    await fillWanted(user);
    await user.click(screen.getByRole('button', { name: /Создать запрос/ }));
    await user.click(await screen.findByRole('button', { name: /К моим запросам/ }));

    expect(await screen.findByText('requests screen')).toBeInTheDocument();
  });

  it('keeps submit disabled until the wanted description is filled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RequestForm />);

    await user.click(screen.getByText('Кухонный комбайн'));
    expect(screen.getByRole('button', { name: /Создать запрос/ })).toBeDisabled();

    await user.type(screen.getByLabelText('Что вы хотите получить'), LONG_WANTED);
    expect(screen.getByRole('button', { name: /Создать запрос/ })).toBeDisabled();

    await pickCategory(user);
    expect(screen.getByRole('button', { name: /Создать запрос/ })).toBeEnabled();
  });

  it('blocks saving a wanted description shorter than 25 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RequestForm />);

    await user.click(screen.getByText('Кухонный комбайн'));
    await user.type(screen.getByLabelText('Что вы хотите получить'), 'x'.repeat(24));
    await pickCategory(user);

    expect(await screen.findByText('Пожалуйста, опишите желаемое подробнее')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать запрос/ })).toBeDisabled();
  });

  // иначе кнопка неактивна, а ошибки на экране нет — пользователю нечем объяснить отказ
  it('explains the blocked save for a request created before the 25-character rule', async () => {
    mockedUseRequest.mockReturnValue(queryOk({ ...liveRequest, wantedDescription: 'Ноутбук' }));
    renderWithProviders(<RequestForm requestId={1} />);

    expect(await screen.findByText('Пожалуйста, опишите желаемое подробнее')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сохранить запрос/ })).toBeDisabled();
  });

  it('shows a thumbnail for an item with a photo', () => {
    renderWithProviders(<RequestForm />);

    expect(screen.getByRole('img', { name: 'Велосипед' })).toHaveAttribute('src', 'bike.png');
  });

  it('keeps an exchanged item out of the offer picker', () => {
    renderWithProviders(<RequestForm />);

    expect(screen.getByText('Кухонный комбайн')).toBeInTheDocument();
    expect(screen.queryByText('Гитара')).not.toBeInTheDocument();
  });

  it('leads to item creation when the user has no items', async () => {
    const user = userEvent.setup();
    mockedUseItems.mockReturnValue(queryOk({ items: [], total: 0 }));
    renderWithProviders(<RequestForm />, {
      routes: [{ path: '/products/new', element: <div>new item screen</div> }],
    });

    await user.click(screen.getByRole('button', { name: /Создать новый товар/ }));
    expect(await screen.findByText('new item screen')).toBeInTheDocument();
  });

  it('locks the form for a locked request', () => {
    mockedUseRequest.mockReturnValue(queryOk(lockedRequest));
    renderWithProviders(<RequestForm requestId={1} />);

    expect(
      screen.getByText('Заявка заблокирована и защищена от редактирования'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сохранить запрос/ })).toBeDisabled();
  });

  it('removes the request through the confirmation modal', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(liveRequest));
    mockedRemoveRequest.mockResolvedValue(undefined);
    renderWithProviders(<RequestForm requestId={1} />);

    await user.click(screen.getByRole('button', { name: /Удалить запрос/ }));
    await user.click(await screen.findByRole('button', { name: /Да, удалить/ }));

    expect(mockedRemoveRequest).toHaveBeenCalledWith(1, 1);
  });

  it('hides removal for a request that is no longer editable', () => {
    mockedUseRequest.mockReturnValue(queryOk(lockedRequest));
    renderWithProviders(<RequestForm requestId={1} />);

    expect(screen.queryByRole('button', { name: /Удалить запрос/ })).not.toBeInTheDocument();
  });

  // request ещё не загрузился — версии нет, удаление ушло бы с version=0 (422 на бэкенде)
  it('does not open removal until the request is loaded', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RequestForm requestId={1} />);

    await user.click(screen.getByRole('button', { name: /Удалить запрос/ }));

    expect(mockedRemoveRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Да, удалить/ })).not.toBeInTheDocument();
  });
});
