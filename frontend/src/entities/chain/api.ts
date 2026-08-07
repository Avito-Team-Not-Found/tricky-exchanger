import { apiClient } from '@shared/api';

import type { Chain, ChainResponseResult } from './model';

export async function fetchRequestChains(requestId: string): Promise<Chain[]> {
  const { data } = await apiClient.get<Chain[]>(`/exchange-requests/${requestId}/chains`);
  return data;
}

export async function fetchChain(chainId: string): Promise<Chain> {
  const { data } = await apiClient.get<Chain>(`/chains/${chainId}`);
  return data;
}

export async function acceptChain(chainId: string): Promise<ChainResponseResult> {
  const { data } = await apiClient.post<ChainResponseResult>(`/chains/${chainId}/responses/accept`);
  return data;
}

export async function declineChain(chainId: string): Promise<ChainResponseResult> {
  const { data } = await apiClient.post<ChainResponseResult>(
    `/chains/${chainId}/responses/decline`,
  );
  return data;
}

export async function selectChain(chainId: string): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post(`/chains/${chainId}/select`);
  return data;
}

export async function deselectChain(chainId: string): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.delete(`/chains/${chainId}/select`);
  return data;
}
