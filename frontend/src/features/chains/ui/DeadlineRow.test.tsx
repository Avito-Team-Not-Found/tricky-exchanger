import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeadlineRow } from './DeadlineRow';

describe('DeadlineRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the remaining time on a proposed chain', () => {
    render(<DeadlineRow status="PROPOSED" deadlineAt="2026-08-10T10:01:00Z" />);

    expect(screen.getByText('Осталось 1 мин на ответ')).toBeInTheDocument();
  });

  it('renders nothing outside PROPOSED even with a deadline set', () => {
    const { container } = render(<DeadlineRow status="FROZEN" deadlineAt="2026-08-10T10:01:00Z" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the deadline is missing', () => {
    const { container } = render(<DeadlineRow status="PROPOSED" />);

    expect(container).toBeEmptyDOMElement();
  });
});
