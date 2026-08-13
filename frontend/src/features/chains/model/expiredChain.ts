import { isAxiosError } from 'axios';

export const EXPIRED_CHAIN_MESSAGE = 'Время истекло, цепочка распалась';

// дедлайн (ответа или быстрой замены) истёк, цепочку уже откатил сервер — подтверждать/выбирать нечего
export function isChainExpired(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 410;
}
