import { apiClient } from '@shared/api';

import type {
  CreateRequestPayload,
  CreateRequestResult,
  ExchangeRequest,
  RequestPatch,
} from './model';

export async function fetchRequests(): Promise<ExchangeRequest[]> {
  const { data } = await apiClient.get<ExchangeRequest[]>('/exchange-requests');
  return data;
}

export async function fetchRequest(requestId: string): Promise<ExchangeRequest> {
  const { data } = await apiClient.get<ExchangeRequest>(`/exchange-requests/${requestId}`);
  return data;
}

export async function createRequest(payload: CreateRequestPayload): Promise<CreateRequestResult> {
  const { data } = await apiClient.post<CreateRequestResult>('/exchange-requests', payload);
  return data;
}

export async function updateRequest(
  requestId: string,
  patch: RequestPatch,
): Promise<ExchangeRequest> {
  const { data } = await apiClient.patch<ExchangeRequest>(`/exchange-requests/${requestId}`, patch);
  return data;
}

export async function removeRequest(requestId: string): Promise<void> {
  await apiClient.delete(`/exchange-requests/${requestId}`);
}
