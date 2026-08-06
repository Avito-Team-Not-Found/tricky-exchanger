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
    condition: 'USED',
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

  it('does not open the card when activating the remove button with the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onRemove = vi.fn();
    renderWithProviders(<RequestCard request={request} onClick={onClick} onRemove={onRemove} />);

    const removeButton = screen.getByRole('button', { name: /Удалить запрос/ });
    removeButton.focus();
    await user.keyboard('{Enter}');

    expect(onRemove).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
