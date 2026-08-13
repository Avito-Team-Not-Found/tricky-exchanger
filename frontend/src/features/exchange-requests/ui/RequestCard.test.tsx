import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ExchangeRequest } from '@entities/exchangeRequest';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { RequestCard } from './RequestCard';

const request = {
  id: 1,
  status: 'ACTIVE',
  offeredItemId: 1,
  offeredItemTitle: 'Комбайн',
  wantedDescription: 'Ноутбук',
  version: 1,
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

  it('shows the offered item photo when the page passes it from the items cache', () => {
    const { container } = renderWithProviders(
      <RequestCard
        request={request}
        offeredItemImageUrl="http://localhost:9000/items/1/photo.png"
        onClick={vi.fn()}
      />,
    );

    const img = container.querySelector(
      '.request-card__image .fade-in-image__fg',
    ) as HTMLImageElement;
    expect(img).toHaveAttribute('src', 'http://localhost:9000/items/1/photo.png');
  });

  it('falls back to the placeholder when the offered item has no photo', () => {
    const { container } = renderWithProviders(
      <RequestCard request={request} offeredItemImageUrl={null} onClick={vi.fn()} />,
    );

    expect(container.querySelector('.request-card__image')).not.toBeInTheDocument();
    expect(container.querySelector('.request-card__placeholder')).toBeInTheDocument();
  });
});
