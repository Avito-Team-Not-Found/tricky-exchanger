import { apiClient } from '@shared/api';

import type {
  Chain,
  ChainVoteResult,
  DeclineResult,
  ExchangeOptions,
  ReplacementOption,
  SelectReplacementResult,
  VotePayload,
} from './model';

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

export async function fetchReplacements(chainId: number): Promise<ReplacementOption[]> {
  // ответ — плоский массив, не {data: [...]} (TZ §3.1)
  const { data } = await apiClient.get<ReplacementOption[]>(`/chains/${chainId}/replacements`);
  return data;
}

export async function selectReplacement(
  chainId: number,
  requestId: number,
): Promise<SelectReplacementResult> {
  const { data } = await apiClient.put<SelectReplacementResult>(`/chains/${chainId}/replacement`, {
    requestId,
  });
  return data;
}

// Собственный отказ актора от замены: при открытой вакансии бэкенд расформировывает цепочку (TZ §3.3)
export async function declineChain(chainId: number): Promise<DeclineResult> {
  const { data } = await apiClient.post<DeclineResult>(`/chains/${chainId}/decline`);
  return data;
}
