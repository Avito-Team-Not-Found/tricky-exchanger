import { useState } from 'react';

import { jsonStorage } from '@shared/lib/storage';

export function disputeKey(chainId: number): string {
  return `deal:dispute:${chainId}`;
}

// Флаг спора по цепочке: ручки спора на бэкенде нет, поэтому после «Открыть спор» вместо ссылки
// показывается строка «Жалоба на рассмотрении», переживающая перезагрузку.
export function useDispute(chainId: number) {
  const [disputed, setDisputed] = useState<boolean>(
    () => jsonStorage.get<boolean>(disputeKey(chainId)) === true,
  );

  const openDispute = () => {
    jsonStorage.set(disputeKey(chainId), true);
    setDisputed(true);
  };

  return { disputed, openDispute };
}
