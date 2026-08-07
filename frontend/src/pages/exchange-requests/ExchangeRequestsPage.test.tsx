import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRequests, type ExchangeRequest } from '@entities/exchangeRequest';
import type { Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ExchangeRequestsPage } from './ExchangeRequestsPage';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

vi.mock('@entities/exchangeRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/exchangeRequest')>();
  return { ...actual, useRequests: vi.fn() };
});

const mockedUseRequests = vi.mocked(useRequests);

function makeRequest(id: string, status: ExchangeRequest['status']): ExchangeRequest {
  return {
    id,
    status,
    offeredItemId: `item-${id}`,
    offeredItem: {
      id: `item-${id}`,
      title: `Товар ${id}`,
      description: '',
      categoryId: null,
      color: null,
      material: null,
      attributes: null,
      image: null,
      status: 'ACTIVE',
      createdAt: '',
      updatedAt: '',
    } as Item,
    wantedDescription: `Хочу ${id}`,
    wantedProfile: null,
    createdAt: '',
    updatedAt: '',
  };
}

const requests = [
  makeRequest('1', 'ACTIVE'),
  makeRequest('2', 'IN_PROPOSAL'),
  makeRequest('3', 'LOCKED'),
  makeRequest('4', 'DONE'),
  makeRequest('5', 'REMOVED'),
];

describe('ExchangeRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    for (const label of ['Активен', 'В процессе', 'Заблокирован', 'Завершён', 'Отменён']) {
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
});
