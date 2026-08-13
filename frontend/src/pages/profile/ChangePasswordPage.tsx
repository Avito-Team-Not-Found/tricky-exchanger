import { ChangePasswordFlow } from '@features/passwordChange';

import { useScreenMotionClass } from '@shared/lib/useScreenMotion';

// экран рендерится вне AppLayout, поэтому enter-анимация перехода навешивается здесь
export function ChangePasswordPage() {
  const screenMotionClass = useScreenMotionClass();

  return (
    <div className={screenMotionClass}>
      <ChangePasswordFlow />
    </div>
  );
}
