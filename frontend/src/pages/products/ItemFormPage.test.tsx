import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createItem, updateItem, useItem, type Item } from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ItemFormPage } from './ItemFormPage';

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return { ...actual, useItem: vi.fn(), updateItem: vi.fn(), createItem: vi.fn() };
});

const mockedUseItem = vi.mocked(useItem);
const mockedUpdateItem = vi.mocked(updateItem);
const mockedCreateItem = vi.mocked(createItem);

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

const item = {
  id: 1,
  title: 'Комбайн',
  description: 'Мощный',
  category: 'Для дома и дачи',
  imageUrl: 'data:image/png;base64,x',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
} as unknown as Item;

function renderEditPage() {
  return renderWithProviders(<div />, {
    initialEntries: ['/products/1/edit'],
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

    await user.clear(screen.getByLabelText('Название'));
    await user.type(screen.getByLabelText('Название'), 'Комбайн Bosch');
    await user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(
      await screen.findByText('Хотите сохранить изменения или вернуться назад?'),
    ).toBeInTheDocument();
    const modal = (await screen.findByRole('dialog')) as HTMLElement;
    await user.click(within(modal).getByRole('button', { name: /Сохранить изменения/ }));

    expect(await screen.findByText('products screen')).toBeInTheDocument();
    expect(mockedUpdateItem).toHaveBeenCalled();
  });

  // «Сохранить изменения» уходило в сабмит без валидации: на неполной форме payload
  // не собирался, сабмит падал молча и оставлял форму заблокированной навсегда
  it('offers only leaving when a dirty create form is incomplete', async () => {
    const user = userEvent.setup();
    mockedUseItem.mockReturnValue(queryOk(undefined));
    renderWithProviders(<div />, {
      initialEntries: ['/products/new'],
      routes: [
        { path: '/products/new', element: <ItemFormPage /> },
        { path: '/products', element: <div>products screen</div> },
      ],
    });

    await user.type(screen.getByLabelText('Название'), 'Часы');
    await user.click(screen.getByRole('button', { name: 'Назад' }));

    const modal = (await screen.findByRole('dialog')) as HTMLElement;
    expect(
      within(modal).queryByRole('button', { name: /Сохранить изменения/ }),
    ).not.toBeInTheDocument();
    await user.click(within(modal).getByRole('button', { name: /Выйти без сохранения/ }));

    expect(await screen.findByText('products screen')).toBeInTheDocument();
    expect(mockedCreateItem).not.toHaveBeenCalled();
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
