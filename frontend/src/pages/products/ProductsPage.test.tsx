import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useItems, type Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ProductsPage } from './ProductsPage';

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, useItems: vi.fn() };
});

const mockedUseItems = vi.mocked(useItems);

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

const items = [
  {
    id: 'item-1',
    title: 'Кухонный комбайн',
    description: 'Мощный',
    condition: 'USED',
    color: 'white',
    material: 'plastic',
    image: null,
    status: 'ACTIVE',
  },
  {
    id: 'item-2',
    title: 'Пылесос',
    description: 'Вертикальный',
    condition: 'LIKE_NEW',
    color: 'red',
    material: 'plastic',
    image: null,
    status: 'RESERVED',
  },
] as unknown as Item[];

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state with a CTA', () => {
    mockedUseItems.mockReturnValue(queryOk([]));
    const { container } = renderWithProviders(<ProductsPage />);

    const emptyState = container.querySelector('.empty-state') as HTMLElement;
    expect(screen.getByText('У вас пока нет товаров')).toBeInTheDocument();
    expect(within(emptyState).getByRole('button', { name: /Добавить товар/ })).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockedUseItems.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as never);
    renderWithProviders(<ProductsPage />);

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    screen.getByRole('button', { name: /Повторить попытку/ }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it('renders product cards with statuses and opens edit on tap', async () => {
    const user = userEvent.setup();
    mockedUseItems.mockReturnValue(queryOk(items));
    renderWithProviders(<ProductsPage />, {
      routes: [{ path: '/products/:itemId/edit', element: <div>edit screen</div> }],
    });

    expect(screen.getByText('Кухонный комбайн')).toBeInTheDocument();
    expect(screen.getByText('Пылесос')).toBeInTheDocument();
    expect(screen.getByText('Активен')).toBeInTheDocument();
    expect(screen.getByText('Забронирован')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Кухонный комбайн/ }));
    expect(await screen.findByText('edit screen')).toBeInTheDocument();
  });
});
