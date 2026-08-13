import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FadeInImage } from './FadeInImage';

const originalComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');

afterEach(() => {
  if (originalComplete) {
    Object.defineProperty(HTMLImageElement.prototype, 'complete', originalComplete);
  }
});

describe('FadeInImage', () => {
  it('keeps the image transparent until it loads', () => {
    const { container } = render(<FadeInImage src="a.jpg" alt="" />);

    expect(container.querySelector('img')).not.toHaveClass('fade-in-image--loaded');
  });

  it('reveals the image when the load event fires', () => {
    const { container } = render(<FadeInImage src="a.jpg" alt="" />);
    const img = container.querySelector('img')!;

    fireEvent.load(img);

    expect(img).toHaveClass('fade-in-image--loaded');
  });

  // кешированная картинка уже complete, и её load мог сработать раньше обработчика
  it('reveals a cached image immediately on mount', () => {
    Object.defineProperty(HTMLImageElement.prototype, 'complete', {
      configurable: true,
      get: () => true,
    });

    const { container } = render(<FadeInImage src="cached.jpg" alt="" />);

    expect(container.querySelector('img')).toHaveClass('fade-in-image--loaded');
  });

  it('reveals a broken image instead of leaving it transparent', () => {
    const { container } = render(<FadeInImage src="broken.jpg" alt="" />);
    const img = container.querySelector('img')!;

    fireEvent.error(img);

    expect(img).toHaveClass('fade-in-image--loaded');
  });

  it('hides again when the src changes and reveals on the new load', () => {
    const { container, rerender } = render(<FadeInImage src="a.jpg" alt="" />);
    const img = () => container.querySelector('img')!;
    fireEvent.load(img());

    rerender(<FadeInImage src="b.jpg" alt="" />);

    expect(img()).not.toHaveClass('fade-in-image--loaded');

    fireEvent.load(img());

    expect(img()).toHaveClass('fade-in-image--loaded');
  });
});
