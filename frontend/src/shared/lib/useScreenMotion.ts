import { useNavigationType } from 'react-router';

// Класс enter-анимации экрана (motion.scss). Историю переходов роутер не отдаёт, поэтому
// направление берём из типа навигации: POP («Назад») — экран въезжает слева, PUSH — справа
export function useScreenMotionClass(): string {
  return useNavigationType() === 'POP' ? 'motion-screen motion-screen--back' : 'motion-screen';
}
