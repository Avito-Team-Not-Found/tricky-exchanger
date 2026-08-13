import { useSearchParams } from 'react-router';

// Выбранный вариант получения живёт в ?option=<requestId>: список вариантов обмена рисует
// по карточке на каждый receiveOption, а экраны цепочки одни на chainId — без этой привязки
// они снова развернули бы звено во весь кластер заявок.
export const RECEIVE_OPTION_PARAM = 'option';

export function useReceiveOption(): number | undefined {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get(RECEIVE_OPTION_PARAM);
  if (!raw) return undefined;
  const requestId = Number(raw);
  return Number.isInteger(requestId) ? requestId : undefined;
}

// хвост ссылки для переходов между экранами цепочки — выбранный вариант не должен теряться
export function receiveOptionQuery(requestId: number | undefined): string {
  return requestId === undefined ? '' : `?${RECEIVE_OPTION_PARAM}=${requestId}`;
}
