import { useState } from 'react';

import { jsonStorage } from '@shared/lib/storage';

import { defaultPickupPoint, pickupPointKey } from './pickupPoints';

// пустой адрес не сохраняется: «Другой адрес» с пустым полем оставляет прежнее значение
export function usePickupPoint(chainId: number) {
  const [point, setPointState] = useState<string>(() => {
    return jsonStorage.get<string>(pickupPointKey(chainId)) ?? defaultPickupPoint();
  });

  const setPoint = (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    jsonStorage.set(pickupPointKey(chainId), trimmed);
    setPointState(trimmed);
  };

  return { point, setPoint };
}
