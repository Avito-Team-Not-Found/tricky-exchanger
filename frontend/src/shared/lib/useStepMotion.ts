import { useState } from 'react';

// motion-step — только при смене шага: на маунте экран уже играет motion-screen, движения наложились бы
export function useStepMotionClass(step: string): string {
  const [initialStep] = useState(step);
  return step === initialStep ? '' : ' motion-step';
}
