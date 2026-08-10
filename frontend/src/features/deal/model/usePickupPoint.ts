import { useState } from 'react';

import { jsonStorage } from '@shared/lib/storage';

import { defaultPickupPoint, pickupPointKey } from './pickupPoints';

// Адрес ПВЗ экрана сделки: хранится в localStorage на цепочку, значение по умолчанию — первый
// из списка (DEAL-PLAN.md §4.1). Пустой адрес не сохраняется — «Другой адрес» с пустым полем
// оставляет прежнее значение.
export function usePickupPoint(chainId: number) {
  const [point, setPointState] = useState<string>(() => {
    return jsonStorage.get<string>(pickupPointKey(chainId)) ?? defaultPickupPoint();
  });

  const setPoint = (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    // имитация: на бэкенде этого нет (DEAL-PLAN.md §4)
    jsonStorage.set(pickupPointKey(chainId), trimmed);
    setPointState(trimmed);
  };

  return { point, setPoint };
}
