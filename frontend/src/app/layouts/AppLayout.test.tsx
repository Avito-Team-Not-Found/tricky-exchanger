import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('shows the tab bar on ordinary screens', () => {
    const { container } = renderWithProviders(<AppLayout />, { initialEntries: ['/products'] });

    expect(container.querySelector('.app-bottom-nav')).toBeInTheDocument();
  });

  it('hides the tab bar on chain screens', () => {
    const { container } = renderWithProviders(<AppLayout />, {
      initialEntries: ['/chains/chain-1/participants'],
    });

    expect(container.querySelector('.app-bottom-nav')).not.toBeInTheDocument();
  });

  it('hides the brand header on chain screens', () => {
    const { container } = renderWithProviders(<AppLayout />, {
      initialEntries: ['/chains/chain-1'],
    });

    expect(container.querySelector('.app-header')).not.toBeInTheDocument();
  });

  // макеты цепочки только мобильные — боковое меню десктопа на этих экранах остаётся
  it('keeps the side menu on chain screens', () => {
    const { container } = renderWithProviders(<AppLayout />, {
      initialEntries: ['/chains/chain-1'],
    });

    expect(container.querySelector('.app-side-menu')).toBeInTheDocument();
  });
});
