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

  it('renders nothing on a frozen chain by default, even with a deadline set', () => {
    const { container } = render(<DeadlineRow status="FROZEN" deadlineAt="2026-08-10T10:01:00Z" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the shipping deadline on a frozen chain when requested', () => {
    render(<DeadlineRow status="FROZEN" deadlineAt="2026-08-10T10:01:00Z" showShipDeadline />);

    expect(screen.getByText('Осталось 1 мин на отправку')).toBeInTheDocument();
  });

  it('renders the fast-replacement deadline on a proposed chain when requested', () => {
    render(
      <DeadlineRow status="PROPOSED" deadlineAt="2026-08-10T10:01:00Z" purpose="replacement" />,
    );

    expect(screen.getByText('Осталось 1 мин на замену')).toBeInTheDocument();
  });

  it('renders nothing on a frozen chain when the shipping deadline is missing', () => {
    const { container } = render(<DeadlineRow status="FROZEN" showShipDeadline />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on a candidate chain even when requested', () => {
    const { container } = render(
      <DeadlineRow status="CANDIDATE" deadlineAt="2026-08-10T10:01:00Z" showShipDeadline />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the deadline is missing', () => {
    const { container } = render(<DeadlineRow status="PROPOSED" />);

    expect(container).toBeEmptyDOMElement();
  });
});
