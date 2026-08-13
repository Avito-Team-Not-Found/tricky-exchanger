import { useEffect } from 'react';

import { useLocation, useNavigationType, type NavigationType } from 'react-router';

// стек ключей сессии — модульный уровень: у экранов, анимирующих вход, свой маунт, а история общая
let historyStack: string[] = [];

function resolveDirection(
  navigationType: NavigationType,
  locationKey: string,
): 'none' | 'forward' | 'back' {
  const stack = historyStack;
  if (stack.length === 0) return 'none';
  if (navigationType === 'POP' && stack.length > 1 && stack[stack.length - 2] === locationKey) {
    return 'back';
  }
  return 'forward';
}

// актуализируем стек в эффекте: рендер навигации считает направление по состоянию до неё,
// а рендер в StrictMode прогоняется дважды
function commitHistory(navigationType: NavigationType, locationKey: string): void {
  const stack = historyStack;
  if (stack[stack.length - 1] === locationKey) return;
  if (stack.length === 0) {
    historyStack = [locationKey];
    return;
  }
  if (navigationType === 'POP' && stack.length > 1 && stack[stack.length - 2] === locationKey) {
    historyStack = stack.slice(0, -1);
  } else if (navigationType === 'REPLACE') {
    historyStack = [...stack.slice(0, -1), locationKey];
  } else {
    historyStack = [...stack, locationKey];
  }
}

// POP — и холодный старт, и «Назад», и «Вперёд»; направление выводим из стека ключей:
// пустой стек — первый маунт (без анимации), POP к предыдущему ключу — «Назад», иначе — «Вперёд»
export function useScreenMotionClass(): string {
  const navigationType = useNavigationType();
  const location = useLocation();

  const direction = resolveDirection(navigationType, location.key);

  useEffect(() => {
    commitHistory(navigationType, location.key);
  }, [navigationType, location.key]);

  if (direction === 'none') return '';
  return direction === 'back' ? 'motion-screen motion-screen--back' : 'motion-screen';
}

// модульный синглтон — тестам нужен сброс между кейсами
export function resetScreenMotionHistory(): void {
  historyStack = [];
}
