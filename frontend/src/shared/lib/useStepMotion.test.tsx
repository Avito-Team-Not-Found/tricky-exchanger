import { useState } from 'react';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useStepMotionClass } from './useStepMotion';

describe('useStepMotionClass', () => {
  it('does not animate the first step (the screen enter animation plays instead)', () => {
    const { result } = renderHook(() => useStepMotionClass('email'));

    expect(result.current).toBe('');
  });

  it('returns the step class when the step changes', () => {
    const { result } = renderHook(() => {
      const [step, setStep] = useState('email');
      const motionClass = useStepMotionClass(step);
      return { motionClass, setStep };
    });

    expect(result.current.motionClass).toBe('');

    act(() => result.current.setStep('code'));

    expect(result.current.motionClass).toBe(' motion-step');
  });
});
