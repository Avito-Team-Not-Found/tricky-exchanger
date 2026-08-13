import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetScreenMotionHistory } from '@shared/lib/useScreenMotion';
import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { AppLayout } from './AppLayout';

function renderLayout(initialEntries: string[]) {
  return renderWithProviders(<AppLayout />, { initialEntries });
}

beforeEach(() => {
  resetScreenMotionHistory();
});

describe('AppLayout', () => {
  it('shows the tab bar on ordinary screens', () => {
    const { container } = renderLayout(['/products']);

    expect(container.querySelector('.app-bottom-nav')).toBeInTheDocument();
  });

  it('hides the tab bar on chain screens', () => {
    const { container } = renderLayout(['/chains/chain-1/participants']);

    expect(container.querySelector('.app-bottom-nav')).not.toBeInTheDocument();
  });

  it('hides the brand header on chain screens', () => {
    const { container } = renderLayout(['/chains/chain-1']);

    expect(container.querySelector('.app-header')).not.toBeInTheDocument();
  });

  it('keeps the side menu on chain screens', () => {
    const { container } = renderLayout(['/chains/chain-1']);

    expect(container.querySelector('.app-side-menu')).toBeInTheDocument();
  });

  // анимации в jsdom не исполняются — проверяем класс на обёртке, на remount которой они держатся
  it('does not animate the screen on the first load', () => {
    const { container } = renderLayout(['/products']);

    const screenNode = container.querySelector('.app-content__screen');
    expect(screenNode).toBeInTheDocument();
    expect(screenNode).not.toHaveClass('motion-screen');
  });

  it('animates the screen when navigating forward', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout(['/products']);

    await user.click(screen.getAllByRole('link', { name: /Профиль/i })[0]);

    expect(container.querySelector('.app-content__screen')).toHaveClass('motion-screen');
  });
});
