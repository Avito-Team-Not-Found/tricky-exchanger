import { useSearchParams } from 'react-router';

// экраны цепочки одни на chainId, а карточек-вариантов на неё несколько: без привязки к
// requestId экран развернул бы звено обратно во весь кластер заявок
export const RECEIVE_OPTION_PARAM = 'option';

export function useReceiveOption(): number | undefined {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get(RECEIVE_OPTION_PARAM);
  if (!raw) return undefined;
  const requestId = Number(raw);
  return Number.isInteger(requestId) ? requestId : undefined;
}

export function receiveOptionQuery(requestId: number | undefined): string {
  return requestId === undefined ? '' : `?${RECEIVE_OPTION_PARAM}=${requestId}`;
}
