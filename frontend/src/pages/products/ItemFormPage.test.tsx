import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateItem, useItem, type Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ItemFormPage } from './ItemFormPage';

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, useItem: vi.fn(), updateItem: vi.fn() };
});

const mockedUseItem = vi.mocked(useItem);
const mockedUpdateItem = vi.mocked(updateItem);

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

const item = {
  id: 'item-1',
  title: 'Комбайн',
  description: 'Мощный',
  categoryId: null,
  condition: 'USED',
  color: 'white',
  material: 'plastic',
  attributes: null,
  image: 'data:image/png;base64,x',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
} as unknown as Item;

function renderEditPage() {
  return renderWithProviders(<div />, {
    initialEntries: ['/products/item-1/edit'],
    routes: [
      { path: '/products/:itemId/edit', element: <ItemFormPage /> },
      { path: '/products', element: <div>products screen</div> },
    ],
  });
}

describe('ItemFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks to save changes before leaving a dirty form', async () => {
    const user = userEvent.setup();
    mockedUseItem.mockReturnValue(queryOk(item));
    mockedUpdateItem.mockResolvedValue(item);
    renderEditPage();

    await user.clear(screen.getByLabelText('Цвет'));
    await user.type(screen.getByLabelText('Цвет'), 'black');
    await user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(
      await screen.findByText('Хотите сохранить изменения или вернуться назад?'),
    ).toBeInTheDocument();
    const modal = (await screen.findByRole('dialog')) as HTMLElement;
    await user.click(within(modal).getByRole('button', { name: /Сохранить изменения/ }));

    expect(await screen.findByText('products screen')).toBeInTheDocument();
    expect(mockedUpdateItem).toHaveBeenCalled();
  });

  it('leaves a clean form without confirmation', async () => {
    const user = userEvent.setup();
    mockedUseItem.mockReturnValue(queryOk(item));
    renderEditPage();

    await user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(await screen.findByText('products screen')).toBeInTheDocument();
    expect(
      screen.queryByText('Хотите сохранить изменения или вернуться назад?'),
    ).not.toBeInTheDocument();
  });
});
