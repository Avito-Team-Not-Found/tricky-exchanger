import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptChain, declineChain, deselectChain, selectChain, type Chain } from '@entities/chain';

import { createTestQueryClient } from '@shared/testing/renderWithProviders';

import { useChainActions } from './useChainActions';

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return {
    ...actual,
    acceptChain: vi.fn(),
    declineChain: vi.fn(),
    selectChain: vi.fn(),
    deselectChain: vi.fn(),
  };
});

const mockedAccept = vi.mocked(acceptChain);
const mockedDecline = vi.mocked(declineChain);
const mockedSelect = vi.mocked(selectChain);
const mockedDeselect = vi.mocked(deselectChain);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <AntApp>{children}</AntApp>
    </QueryClientProvider>
  );
}

const chain = {
  id: 'chain-1',
  requestId: 'req-1',
  status: 'CANDIDATE',
  score: 0.72,
  responseDeadlineAt: null,
  freezeDeadlineAt: null,
  participants: [],
  viewerPermissions: {
    canRespond: true,
    canSelect: false,
    canDeselect: false,
    canVote: false,
    canRequestReplacement: false,
  },
} as Chain;

describe('useChainActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms an accept response through the modal', async () => {
    mockedAccept.mockResolvedValue({
      chainId: chain.id,
      status: 'CANDIDATE',
      isReadyForSelection: true,
    } as never);
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainActions(), { wrapper });

    result.current.confirmResponse(chain, 'accept');
    await user.click(await screen.findByRole('button', { name: 'Да, принять' }));

    await waitFor(() => expect(mockedAccept).toHaveBeenCalledWith('chain-1'));
  });

  it('confirms a decline response through the modal', async () => {
    mockedDecline.mockResolvedValue({
      chainId: chain.id,
      status: 'CANDIDATE',
      isReadyForSelection: false,
    } as never);
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainActions(), { wrapper });

    result.current.confirmResponse(chain, 'decline');
    await user.click(await screen.findByRole('button', { name: 'Да, отказаться' }));

    await waitFor(() => expect(mockedDecline).toHaveBeenCalledWith('chain-1'));
  });

  // выбор ничего не блокирует и обратим — подтверждения не требует
  it('selects a chain without a confirmation modal', async () => {
    mockedSelect.mockResolvedValue({ id: chain.id, status: 'PROPOSED' } as never);
    const { result } = renderHook(() => useChainActions(), { wrapper });

    result.current.chooseChain(chain);

    await waitFor(() => expect(mockedSelect).toHaveBeenCalledWith('chain-1'));
  });

  it('confirms cancelling a selection through the modal', async () => {
    mockedDeselect.mockResolvedValue({ id: chain.id, status: 'CANDIDATE' } as never);
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainActions(), { wrapper });

    result.current.confirmCancelChoice(chain);
    await user.click(await screen.findByRole('button', { name: 'Да, отменить' }));

    await waitFor(() => expect(mockedDeselect).toHaveBeenCalledWith('chain-1'));
  });

  it('reports a pending response so the UI can block double submits', async () => {
    mockedAccept.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    const { result } = renderHook(() => useChainActions(), { wrapper });

    result.current.confirmResponse(chain, 'accept');
    await user.click(await screen.findByRole('button', { name: 'Да, принять' }));

    await waitFor(() => expect(result.current.isResponding).toBe(true));
  });
});
