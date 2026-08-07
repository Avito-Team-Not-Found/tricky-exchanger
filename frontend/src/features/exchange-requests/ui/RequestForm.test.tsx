import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCategories } from '@entities/category';
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

vi.mock('@entities/category', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/category')>();
  return { ...actual, useCategories: vi.fn() };
});

const mockedCreateRequest = vi.mocked(createRequest);
const mockedRemoveRequest = vi.mocked(removeRequest);
const mockedUseRequest = vi.mocked(useRequest);
const mockedUseItems = vi.mocked(useItems);
const mockedUseCategories = vi.mocked(useCategories);

const items = [
  {
    id: 'item-1',
    title: 'Кухонный комбайн',
    description: 'Мощный',
    color: 'white',
    material: 'plastic',
    image: null,
    status: 'ACTIVE',
  },
  {
    id: 'item-2',
    title: 'Велосипед',
    description: 'Городской',
    color: 'blue',
    material: 'steel',
    image: 'bike.png',
    status: 'RESERVED',
  },
] as unknown as Item[];

const lockedRequest = {
  id: 'req-1',
  status: 'LOCKED',
  offeredItemId: 'item-1',
  offeredItem: items[0],
  wantedDescription: 'Ноутбук',
  wantedProfile: null,
} as unknown as ExchangeRequest;

const liveRequest = { ...lockedRequest, status: 'ACTIVE' } as ExchangeRequest;

// фильтр поиска обязателен — без него кнопка сабмита остаётся заблокированной
async function fillWanted(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Что вы хотите получить'), 'Ноутбук');
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByText('Электроника'));
}

describe('RequestForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseItems.mockReturnValue(queryOk(items));
    mockedUseCategories.mockReturnValue(queryOk([{ id: 'electronics', name: 'Электроника' }]));
    mockedUseRequest.mockReturnValue(queryOk(undefined));
  });

  it('shows the matching result when chains are found', async () => {
    const user = userEvent.setup();
    mockedCreateRequest.mockResolvedValue({
      request: { id: 'req-2', status: 'IN_PROPOSAL' } as unknown as ExchangeRequest,
      matching: { createdCandidateChains: 2 },
    });
    renderWithProviders(<RequestForm />);

    await user.click(screen.getByText('Кухонный комбайн'));
    await fillWanted(user);
    await user.click(screen.getByRole('button', { name: /Создать запрос/ }));

    expect(
      await screen.findByText(
        'Найдено 2 подходящих цепочек. Заявка перешла в статус «В процессе».',
      ),
    ).toBeInTheDocument();
    expect(mockedCreateRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        offeredItemId: 'item-1',
        wantedDescription: 'Ноутбук',
        wantedProfile: { categoryId: 'electronics' },
      }),
    );
  });

  it('keeps the request in search when no chains are found', async () => {
    const user = userEvent.setup();
    mockedCreateRequest.mockResolvedValue({
      request: { id: 'req-2', status: 'ACTIVE' } as unknown as ExchangeRequest,
      matching: { createdCandidateChains: 0 },
    });
    renderWithProviders(<RequestForm />);

    await user.click(screen.getByText('Кухонный комбайн'));
    await fillWanted(user);
    await user.click(screen.getByRole('button', { name: /Создать запрос/ }));

    expect(
      await screen.findByText('Пока подходящих цепочек нет — заявка остаётся в поиске.'),
    ).toBeInTheDocument();
  });

  it('keeps submit disabled until the search filter is filled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RequestForm />);

    await user.click(screen.getByText('Кухонный комбайн'));
    await user.type(screen.getByLabelText('Что вы хотите получить'), 'Ноутбук');
    expect(screen.getByRole('button', { name: /Создать запрос/ })).toBeDisabled();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Электроника'));
    expect(screen.getByRole('button', { name: /Создать запрос/ })).toBeEnabled();
  });

  it('shows a thumbnail for an item with a photo', () => {
    renderWithProviders(<RequestForm />);

    expect(screen.getByRole('img', { name: 'Велосипед' })).toHaveAttribute('src', 'bike.png');
  });

  it('leads to item creation when the user has no items', async () => {
    const user = userEvent.setup();
    mockedUseItems.mockReturnValue(queryOk([]));
    renderWithProviders(<RequestForm />, {
      routes: [{ path: '/products/new', element: <div>new item screen</div> }],
    });

    await user.click(screen.getByRole('button', { name: /Создать новый товар/ }));
    expect(await screen.findByText('new item screen')).toBeInTheDocument();
  });

  it('locks the form for a locked request', () => {
    mockedUseRequest.mockReturnValue(queryOk(lockedRequest));
    renderWithProviders(<RequestForm requestId="req-1" />);

    expect(
      screen.getByText('Заявка заблокирована и защищена от редактирования'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сохранить запрос/ })).toBeDisabled();
  });

  it('removes the request through the confirmation modal', async () => {
    const user = userEvent.setup();
    mockedUseRequest.mockReturnValue(queryOk(liveRequest));
    mockedRemoveRequest.mockResolvedValue(undefined);
    renderWithProviders(<RequestForm requestId="req-1" />);

    await user.click(screen.getByRole('button', { name: /Удалить запрос/ }));
    await user.click(await screen.findByRole('button', { name: /Да, удалить/ }));

    expect(mockedRemoveRequest).toHaveBeenCalledWith('req-1');
  });

  it('hides removal for a request that is no longer editable', () => {
    mockedUseRequest.mockReturnValue(queryOk(lockedRequest));
    renderWithProviders(<RequestForm requestId="req-1" />);

    expect(screen.queryByRole('button', { name: /Удалить запрос/ })).not.toBeInTheDocument();
  });
});
