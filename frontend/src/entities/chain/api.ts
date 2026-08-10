import { apiClient } from '@shared/api';

import type {
  Chain,
  ChainVoteResult,
  ConfirmResult,
  DeclineResult,
  ExchangeOptions,
  VotePayload,
  VoteValue,
} from './model';

// ответ POST /chains/{id}/think: явное «я подумаю» — голос thinking на сервере (SOFT-LOCK §3.2)
export interface ThinkResult {
  chainId: number;
  vote: VoteValue;
}

export async function fetchChain(chainId: number): Promise<Chain> {
  const { data } = await apiClient.get<Chain>(`/chains/${chainId}`);
  return data;
}

export async function fetchExchangeOptions(offerId: number): Promise<ExchangeOptions[]> {
  const { data } = await apiClient.get<ExchangeOptions[]>(
    `/exchange-offers/${offerId}/exchange-options`,
  );
  return data;
}

// направленный отклик на конкретную заявку следующего звена; кольцо откликов замыкает бэкенд
export async function voteForRequest(
  chainId: number,
  payload: VotePayload,
): Promise<ChainVoteResult> {
  const { data } = await apiClient.put<ChainVoteResult>(`/chains/${chainId}/votes`, payload);
  return data;
}

export async function withdrawVote(chainId: number, payload: VotePayload): Promise<void> {
  await apiClient.delete(`/chains/${chainId}/votes`, { params: payload });
}

// повторное подтверждение участия в собранной цепочке (второй раунд, SOFT-LOCK §3.1.3)
export async function confirmChain(chainId: number): Promise<ConfirmResult> {
  const { data } = await apiClient.post<ConfirmResult>(`/chains/${chainId}/confirm`);
  return data;
}

// отказ от участия в собранной цепочке (второй раунд, SOFT-LOCK §3.2)
export async function declineChain(chainId: number): Promise<DeclineResult> {
  const { data } = await apiClient.post<DeclineResult>(`/chains/${chainId}/decline`);
  return data;
}

// явное «я подумаю»: решение откладывается, но голос уже не pending (второй раунд, SOFT-LOCK §3.2)
export async function thinkChain(chainId: number): Promise<ThinkResult> {
  const { data } = await apiClient.post<ThinkResult>(`/chains/${chainId}/think`);
  return data;
}
