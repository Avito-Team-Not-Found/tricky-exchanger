import { useEffect } from 'react';

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSearchParams } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  archiveItem,
  createItem,
  ItemImageUploadError,
  updateItem,
  useItem,
  type Item,
} from '@entities/item';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ItemForm } from './ItemForm';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false } as never;
}

vi.mock('@entities/item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/item')>();
  return {
    ...actual,
    useItem: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    archiveItem: vi.fn(),
  };
});

const mockedUseItem = vi.mocked(useItem);
const mockedCreateItem = vi.mocked(createItem);
const mockedUpdateItem = vi.mocked(updateItem);
const mockedArchiveItem = vi.mocked(archiveItem);

const existingItem = {
  id: 1,
  title: 'Кухонный комбайн',
  description: 'Мощный',
  imageUrl: 'data:image/png;base64,abc',
} as unknown as Item;

const photo = new File(['bytes'], 'photo.png', { type: 'image/png' });

// записываем search-параметры экрана редактирования, чтобы проверить сохранившийся returnTo
const editLocation = { search: '' };

function EditScreenSpy() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    editLocation.search = searchParams.toString();
  }, [searchParams]);
  return <div>edit screen</div>;
}

describe('ItemForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseItem.mockReturnValue(queryOk(undefined));
    editLocation.search = '';
  });

  it('keeps the submit button disabled until photo and required fields are filled', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ItemForm />);

    const submit = screen.getByRole('button', { name: /Сохранить/ });
    expect(submit).toBeDisabled();

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, photo);
    await user.type(screen.getByLabelText('Название'), 'Смарт-часы');
    await user.type(screen.getByLabelText('Описание'), 'Работают как новые');
    expect(submit).toBeEnabled();
  });

  it('creates an item on submit', async () => {
    const user = userEvent.setup();
    mockedCreateItem.mockResolvedValue(existingItem);
    const { container } = renderWithProviders(<ItemForm />, {
      routes: [{ path: '/products', element: <div>products screen</div> }],
    });

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, photo);
    await user.type(screen.getByLabelText('Название'), 'Смарт-часы');
    await user.type(screen.getByLabelText('Описание'), 'Работают как новые');
    await user.click(screen.getByRole('button', { name: /Сохранить/ }));

    expect(await screen.findByText('products screen')).toBeInTheDocument();
    expect(mockedCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Смарт-часы', description: 'Работают как новые' }),
      expect.any(File),
    );
  });

  // создание товара из формы запроса (PROJECT.md §2.4): фото не загрузилось — товар уже создан,
  // ведём на редактирование, сохраняя returnTo=request, чтобы после дозагрузки вернуться в запрос
  it('redirects to edit with returnTo=request when the photo upload fails in create-from-request', async () => {
    const user = userEvent.setup();
    mockedCreateItem.mockRejectedValue(new ItemImageUploadError(existingItem, new Error('upload')));
    const { container } = renderWithProviders(<ItemForm />, {
      initialEntries: ['/products/new?returnTo=request'],
      routes: [{ path: '/products/:itemId/edit', element: <EditScreenSpy /> }],
    });

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, photo);
    await user.type(screen.getByLabelText('Название'), 'Смарт-часы');
    await user.type(screen.getByLabelText('Описание'), 'Работают как новые');
    await user.click(screen.getByRole('button', { name: /Сохранить/ }));

    expect(await screen.findByText('edit screen')).toBeInTheDocument();
    expect(editLocation.search).toContain('returnTo=request');
  });

  it('shows an error state when the item fails to load', () => {
    mockedUseItem.mockReturnValue({ data: undefined, isPending: false, isError: true } as never);
    renderWithProviders(<ItemForm itemId={1} />);

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
  });

  it('prefills an existing item and saves the changes', async () => {
    const user = userEvent.setup();
    mockedUseItem.mockReturnValue(queryOk(existingItem));
    mockedUpdateItem.mockResolvedValue(existingItem);
    renderWithProviders(<ItemForm itemId={1} />, {
      routes: [{ path: '/products', element: <div>products screen</div> }],
    });

    expect(screen.getByLabelText('Название')).toHaveValue('Кухонный комбайн');
    expect(screen.getByLabelText('Описание')).toHaveValue('Мощный');

    await user.clear(screen.getByLabelText('Название'));
    await user.type(screen.getByLabelText('Название'), 'Комбайн Bosch');
    await user.click(screen.getByRole('button', { name: /Сохранить изменения/ }));

    expect(await screen.findByText('products screen')).toBeInTheDocument();
    expect(mockedUpdateItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: 'Комбайн Bosch',
        description: 'Мощный',
      }),
      undefined,
    );
  });

  it('requires a photo even when editing an item without one', () => {
    mockedUseItem.mockReturnValue(queryOk({ ...existingItem, imageUrl: null }));
    renderWithProviders(<ItemForm itemId={1} />);

    expect(screen.getByText('Добавить фото')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сохранить изменения/ })).toBeDisabled();
  });

  it('removing the photo blocks saving', async () => {
    const user = userEvent.setup();
    mockedUseItem.mockReturnValue(queryOk(existingItem));
    renderWithProviders(<ItemForm itemId={1} />);

    expect(screen.getByRole('button', { name: /Удалить фото/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Удалить фото/ }));

    expect(screen.getByText('Добавить фото')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сохранить изменения/ })).toBeDisabled();
  });

  // без Object URL API превью нет, но файл выбран: <img> без src рисуется битой картинкой,
  // поэтому вместо него показываем заглушку
  it('shows a placeholder instead of a broken image when object URLs are unavailable', async () => {
    const user = userEvent.setup();
    const original = URL.createObjectURL;
    // намеренно воспроизводим окружение без Object URL API (через Reflect, чтобы не зависеть
    // от строгости tsconfig: присваивание undefined напрямую типизируется по-разному)
    Reflect.set(URL, 'createObjectURL', undefined);
    try {
      const { container } = renderWithProviders(<ItemForm />);
      await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, photo);

      expect(screen.getByText('Фото выбрано')).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Фото товара' })).not.toBeInTheDocument();
      expect(screen.queryByText('Добавить фото')).not.toBeInTheDocument();
    } finally {
      Reflect.set(URL, 'createObjectURL', original);
    }
  });

  it('archives an item through the confirmation modal and redirects', async () => {
    const user = userEvent.setup();
    mockedUseItem.mockReturnValue(queryOk(existingItem));
    mockedArchiveItem.mockResolvedValue(undefined);
    renderWithProviders(<ItemForm itemId={1} />, {
      routes: [{ path: '/products', element: <div>products screen</div> }],
    });

    await user.click(screen.getByRole('button', { name: /Удалить товар/ }));
    await user.click(await screen.findByRole('button', { name: /Да, удалить/ }));

    expect(await screen.findByText('products screen')).toBeInTheDocument();
    expect(mockedArchiveItem).toHaveBeenCalledWith(1);
  });
});
