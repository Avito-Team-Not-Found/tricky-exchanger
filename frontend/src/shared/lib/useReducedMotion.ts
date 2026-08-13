import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// Внешний стор, а не useState с эффектом: значение читается синхронно в первом же рендере,
// поэтому анимация не успевает проиграться до того, как настройка учтена
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
