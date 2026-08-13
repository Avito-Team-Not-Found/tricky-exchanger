import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRequests, type ExchangeRequest } from '@entities/exchangeRequest';
import { useItems, type Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ExchangeRequestsPage } from './ExchangeRequestsPage';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

vi.mock('@entities/exchangeRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/exchangeRequest')>();
  return { ...actual, useRequests: vi.fn() };
});

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, useItems: vi.fn() };
});

const mockedUseRequests = vi.mocked(useRequests);
const mockedUseItems = vi.mocked(useItems);

const item = {
  id: 1,
  title: 'Товар 1',
  description: '',
  category: '',
  imageUrl: 'http://localhost:9000/items/1/photo.png',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
} as Item;

function makeRequest(id: number, status: ExchangeRequest['status']): ExchangeRequest {
  return {
    id,
    status,
    offeredItemId: id,
    offeredItemTitle: `Товар ${id}`,
    wantedDescription: `Хочу ${id}`,
    wantedCategory: '',
    version: 1,
    createdAt: '',
    updatedAt: '',
  };
}

const requests = [
  makeRequest(1, 'ACTIVE'),
  makeRequest(2, 'IN_PROPOSAL'),
  makeRequest(3, 'LOCKED'),
  makeRequest(4, 'DONE'),
  makeRequest(5, 'IN_PROGRESS'),
];

describe('ExchangeRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseItems.mockReturnValue(queryOk({ items: [], total: 0 }));
  });

  it('shows the empty state with a CTA', () => {
    mockedUseRequests.mockReturnValue(queryOk([]));
    const { container } = renderWithProviders(<ExchangeRequestsPage />);

    const emptyState = container.querySelector('.empty-state') as HTMLElement;
    expect(screen.getByText('У вас нет запросов')).toBeInTheDocument();
    expect(within(emptyState).getByRole('button', { name: /Создать запрос/ })).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockedUseRequests.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as never);
    renderWithProviders(<ExchangeRequestsPage />);

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
  });

  it('renders all request statuses', () => {
    mockedUseRequests.mockReturnValue(queryOk(requests));
    renderWithProviders(<ExchangeRequestsPage />);

    for (const label of ['Активен', 'В процессе', 'Зарезервирован', 'Завершён', 'Выполняется']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('opens the exchange options on card click', async () => {
    const user = userEvent.setup();
    mockedUseRequests.mockReturnValue(queryOk([requests[0]]));
    renderWithProviders(<ExchangeRequestsPage />, {
      routes: [{ path: '/exchange-requests/1', element: <div>chains screen</div> }],
    });

    await user.click(screen.getByRole('button', { name: /Запрос/ }));
    expect(await screen.findByText('chains screen')).toBeInTheDocument();
  });

  it('opens the exchange options for a request with found chains', async () => {
    const user = userEvent.setup();
    mockedUseRequests.mockReturnValue(queryOk([requests[1]]));
    renderWithProviders(<ExchangeRequestsPage />, {
      routes: [{ path: '/exchange-requests/2', element: <div>chains screen</div> }],
    });

    await user.click(screen.getByRole('button', { name: /Запрос/ }));
    expect(await screen.findByText('chains screen')).toBeInTheDocument();
  });

  it('shows the offered item photo taken from the items cache', () => {
    mockedUseRequests.mockReturnValue(queryOk([requests[0]]));
    mockedUseItems.mockReturnValue(queryOk({ items: [item], total: 1 }));

    const { container } = renderWithProviders(<ExchangeRequestsPage />);

    const img = container.querySelector(
      '.request-card__image .fade-in-image__fg',
    ) as HTMLImageElement;
    expect(img).toHaveAttribute('src', 'http://localhost:9000/items/1/photo.png');
  });
});
