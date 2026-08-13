import { apiClient } from '@shared/api';

import type {
  Chain,
  ChainVoteResult,
  ConfirmResult,
  DeclineResult,
  ExchangeOptions,
  FulfillmentResult,
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

// пул кандидатов на замену выбывшего участника; ответ — плоский массив, не {data: [...]}
export async function fetchReplacements(chainId: number): Promise<ReplacementOption[]> {
  const { data } = await apiClient.get<ReplacementOption[]>(`/chains/${chainId}/replacements`);
  return data;
}

// приглашение кандидата на освободившуюся позицию; не идемпотентно — повторный PUT тем же
// requestId сервер отклонит (422)
export async function selectReplacement(
  chainId: number,
  requestId: number,
): Promise<SelectReplacementResult> {
  const { data } = await apiClient.put<SelectReplacementResult>(`/chains/${chainId}/replacement`, {
    requestId,
  });
  return data;
}

// повторное подтверждение участия в собранной цепочке (второй раунд)
export async function confirmChain(chainId: number): Promise<ConfirmResult> {
  const { data } = await apiClient.post<ConfirmResult>(`/chains/${chainId}/confirm`);
  return data;
}

// отказ от участия в собранной цепочке (второй раунд)
export async function declineChain(chainId: number): Promise<DeclineResult> {
  const { data } = await apiClient.post<DeclineResult>(`/chains/${chainId}/decline`);
  return data;
}

// «Я отправил товар» — имитация подтверждения пунктом выдачи: requestId — моя
// заявка (chain.currentRequestId), она LOCKED → IN_PROGRESS, цепочка FROZEN → IN_PROGRESS
export async function confirmHandoff(
  chainId: number,
  requestId: number,
): Promise<FulfillmentResult> {
  const { data } = await apiClient.post<FulfillmentResult>('/integrations/avito/handoffs', {
    chainId,
    requestId,
  });
  return data;
}

// «Я забрал товар» — подтверждение получения: requestId — заявка звена-источника
// (receivesFromPosition), она IN_PROGRESS → DONE; когда все заявки DONE — цепочка COMPLETED
export async function confirmReceipt(
  chainId: number,
  requestId: number,
): Promise<FulfillmentResult> {
  const { data } = await apiClient.post<FulfillmentResult>(`/chains/${chainId}/receipt`, {
    requestId,
  });
  return data;
}
