import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ExchangeRequest } from '@entities/exchangeRequest';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { RequestCard } from './RequestCard';

const request = {
  id: 'req-1',
  status: 'ACTIVE',
  offeredItemId: 'item-1',
  offeredItem: {
    id: 'item-1',
    title: 'Комбайн',
    description: '',
    categoryId: null,
    color: null,
    material: null,
    attributes: null,
    image: null,
    status: 'ACTIVE',
    createdAt: '',
    updatedAt: '',
  },
  wantedDescription: 'Ноутбук',
  wantedProfile: null,
  createdAt: '',
  updatedAt: '',
} as ExchangeRequest;

describe('RequestCard', () => {
  it('opens the card on click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(<RequestCard request={request} onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /Запрос/ }));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows what is offered and what is wanted on separate lines', () => {
    renderWithProviders(<RequestCard request={request} onClick={vi.fn()} />);

    expect(screen.getByText('Комбайн')).toBeInTheDocument();
    expect(screen.getByText('Ноутбук')).toBeInTheDocument();
    // подписи заменены стрелкой, поэтому смысл строк остаётся только в aria-label карточки
    expect(screen.getByRole('button')).toHaveAccessibleName('Запрос: отдаю Комбайн, хочу Ноутбук');
  });

  it('keeps the status tag on the same line as the offered item', () => {
    const { container } = renderWithProviders(<RequestCard request={request} onClick={vi.fn()} />);

    const head = container.querySelector('.request-card__head') as HTMLElement;
    expect(head).toContainElement(screen.getByText('Активен'));
  });
});
