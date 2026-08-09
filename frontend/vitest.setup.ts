import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom не реализует matchMedia, но на него опираются адаптивные компоненты antd;
// в настоящем node-окружении окна нет, поэтому шим подключается только под jsdom
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // antd (Upload, Select и др.) опирается на ResizeObserver, которого нет в jsdom
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

  // jsdom не реализует Object URL API. Без шима превью выбранного фото всегда было бы
  // null, и тесты формы товара «проходили» бы, не проверяя превью вообще
  if (typeof URL.createObjectURL !== 'function') {
    let counter = 0;
    URL.createObjectURL = () => `blob:mock/${++counter}`;
    URL.revokeObjectURL = () => {};
  }
}

afterEach(() => {
  cleanup();
});
