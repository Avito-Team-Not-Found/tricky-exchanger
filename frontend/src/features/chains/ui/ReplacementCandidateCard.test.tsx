import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ReplacementOption } from '@entities/chain';

import { ReplacementCandidateCard } from './ReplacementCandidateCard';

const OPTION: ReplacementOption = {
  requestId: 1,
  offeredItemId: 2,
  title: 'Велосипед',
  description: 'Городской велосипед, два года, всё работает',
  wantedDescription: 'Ищу фотоаппарат',
  reliability: 0.8,
  // свежая заявка — метка «Актуальна», чтобы тест не зависел от текущей даты
  respondedAt: new Date().toISOString(),
};

describe('ReplacementCandidateCard', () => {
  it('shows the full description and the wanted line', () => {
    render(<ReplacementCandidateCard option={OPTION} />);

    expect(screen.getByText(OPTION.description)).toBeInTheDocument();
    expect(screen.getByText(`Хочет: ${OPTION.wantedDescription}`)).toBeInTheDocument();
  });

  it('shows the photo with the title as its alt text', () => {
    render(<ReplacementCandidateCard option={{ ...OPTION, imageUrl: 'https://x/y.jpg' }} />);

    const img = screen.getByRole('img', { name: OPTION.title });
    expect(img).toHaveAttribute('src', 'https://x/y.jpg');
  });

  it('shows the first letter placeholder when the photo is missing', () => {
    const { container } = render(<ReplacementCandidateCard option={OPTION} />);

    expect(container.querySelector('.replacement-card__photo-placeholder')).toHaveTextContent(
      OPTION.title[0],
    );
  });

  it('offers a radio only in the selectable variant', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<ReplacementCandidateCard option={OPTION} onSelect={onSelect} />);

    const radio = screen.getByRole('radio');
    await user.click(radio);
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(<ReplacementCandidateCard option={OPTION} />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
