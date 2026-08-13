import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FadeInImage } from './FadeInImage';

const originalComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');

function getRoot(container: HTMLElement): HTMLElement {
  return container.querySelector('.fade-in-image') as HTMLElement;
}

// foreground-картинка несёт fade-логику: bg-копия только фон, её load не запускает появление
function getForeground(container: HTMLElement): HTMLImageElement {
  return container.querySelector('.fade-in-image__fg') as HTMLImageElement;
}

afterEach(() => {
  if (originalComplete) {
    Object.defineProperty(HTMLImageElement.prototype, 'complete', originalComplete);
  }
});

describe('FadeInImage', () => {
  it('keeps the image transparent until it loads', () => {
    const { container } = render(<FadeInImage src="a.jpg" alt="" />);

    expect(getRoot(container)).not.toHaveClass('fade-in-image--loaded');
  });

  it('reveals the image when the load event fires', () => {
    const { container } = render(<FadeInImage src="a.jpg" alt="" />);

    fireEvent.load(getForeground(container));

    expect(getRoot(container)).toHaveClass('fade-in-image--loaded');
  });

  // кешированная картинка уже complete, и её load мог сработать раньше обработчика
  it('reveals a cached image immediately on mount', () => {
    Object.defineProperty(HTMLImageElement.prototype, 'complete', {
      configurable: true,
      get: () => true,
    });

    const { container } = render(<FadeInImage src="cached.jpg" alt="" />);

    expect(getRoot(container)).toHaveClass('fade-in-image--loaded');
  });

  it('reveals a broken image instead of leaving it transparent', () => {
    const { container } = render(<FadeInImage src="broken.jpg" alt="" />);

    fireEvent.error(getForeground(container));

    expect(getRoot(container)).toHaveClass('fade-in-image--loaded');
  });

  it('hides again when the src changes and reveals on the new load', () => {
    const { container, rerender } = render(<FadeInImage src="a.jpg" alt="" />);
    fireEvent.load(getForeground(container));

    rerender(<FadeInImage src="b.jpg" alt="" />);

    expect(getRoot(container)).not.toHaveClass('fade-in-image--loaded');

    fireEvent.load(getForeground(container));

    expect(getRoot(container)).toHaveClass('fade-in-image--loaded');
  });
});
