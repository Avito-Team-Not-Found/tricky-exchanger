import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useItemsPage, type Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ProductsPage } from './ProductsPage';

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, useItemsPage: vi.fn() };
});

const mockedUseItemsPage = vi.mocked(useItemsPage);

function pageQuery(
  items: Item[],
  total: number,
  {
    hasNextPage,
    fetchNextPage,
  }: { hasNextPage: boolean; fetchNextPage?: ReturnType<typeof vi.fn> },
) {
  return {
    data: { pages: [{ items, total }], pageParams: [1] },
    isPending: false,
    isLoading: false,
    isError: false,
    hasNextPage,
    fetchNextPage: fetchNextPage ?? vi.fn(),
    isFetchingNextPage: false,
    refetch: vi.fn(),
  } as never;
}

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
    title: 'Пылесос',
    description: 'Вертикальный',
    category: '',
    imageUrl: null,
    status: 'UNAVAILABLE',
  },
  {
    id: 3,
    title: 'Старый стол',
    description: 'Деревянный',
    category: '',
    imageUrl: null,
    status: 'ARCHIVED',
  },
] as unknown as Item[];

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state with a CTA', () => {
    mockedUseItemsPage.mockReturnValue(pageQuery([], 0, { hasNextPage: false }));
    const { container } = renderWithProviders(<ProductsPage />);

    const emptyState = container.querySelector('.empty-state') as HTMLElement;
    expect(screen.getByText('У вас пока нет товаров')).toBeInTheDocument();
    expect(within(emptyState).getByRole('button', { name: /Добавить товар/ })).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockedUseItemsPage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);
    renderWithProviders(<ProductsPage />);

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    screen.getByRole('button', { name: /Повторить попытку/ }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the loading skeleton while the first page is loading', () => {
    mockedUseItemsPage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);
    const { container } = renderWithProviders(<ProductsPage />);

    expect(container.querySelector('.ant-skeleton')).toBeInTheDocument();
  });

  it('renders product cards with statuses and opens edit on tap', async () => {
    const user = userEvent.setup();
    mockedUseItemsPage.mockReturnValue(pageQuery(items, items.length, { hasNextPage: false }));
    renderWithProviders(<ProductsPage />, {
      routes: [{ path: '/products/:itemId/edit', element: <div>edit screen</div> }],
    });

    expect(screen.getByText('Кухонный комбайн')).toBeInTheDocument();
    expect(screen.getByText('Пылесос')).toBeInTheDocument();
    expect(screen.getByText('Активен')).toBeInTheDocument();
    expect(screen.getByText('Недоступен')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Кухонный комбайн/ }));
    expect(await screen.findByText('edit screen')).toBeInTheDocument();
  });

  it('loads the next page on «Показать ещё»', async () => {
    const user = userEvent.setup();
    const fetchNextPage = vi.fn();
    mockedUseItemsPage.mockReturnValue(pageQuery(items, 150, { hasNextPage: true, fetchNextPage }));
    renderWithProviders(<ProductsPage />);

    await user.click(screen.getByRole('button', { name: /Показать ещё/ }));

    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('hides «Показать ещё» when all items are loaded', () => {
    mockedUseItemsPage.mockReturnValue(pageQuery(items, items.length, { hasNextPage: false }));
    renderWithProviders(<ProductsPage />);

    expect(screen.queryByRole('button', { name: /Показать ещё/ })).not.toBeInTheDocument();
  });

  it('shows an archived card marked with its status', () => {
    mockedUseItemsPage.mockReturnValue(pageQuery(items, items.length, { hasNextPage: false }));
    renderWithProviders(<ProductsPage />);

    expect(screen.getByText('Старый стол')).toBeInTheDocument();
    expect(screen.getByText('В архиве')).toBeInTheDocument();
  });

  // при провале подгрузки следующей страницы useInfiniteQuery выставляет isError даже при
  // наличии данных — сетку с уже загруженными карточками экраном ошибки не заменяем
  it('keeps the grid when a later page load fails', () => {
    mockedUseItemsPage.mockReturnValue({
      data: { pages: [{ items, total: items.length }], pageParams: [1] },
      isPending: false,
      isLoading: false,
      isError: true,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      refetch: vi.fn(),
    } as never);
    renderWithProviders(<ProductsPage />);

    expect(screen.getByText('Кухонный комбайн')).toBeInTheDocument();
    expect(screen.queryByText('Что-то пошло не так')).not.toBeInTheDocument();
  });
});
