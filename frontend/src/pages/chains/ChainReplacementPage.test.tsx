import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  selectReplacement,
  useChain,
  useReplacements,
  type Chain,
  type ChainParticipant,
  type ReplacementOption,
} from '@entities/chain';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { ChainReplacementPage } from './ChainReplacementPage';

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return {
    ...actual,
    useChain: vi.fn(),
    useReplacements: vi.fn(),
    selectReplacement: vi.fn(),
    declineChain: vi.fn(),
  };
});

const mockedUseChain = vi.mocked(useChain);
const mockedUseReplacements = vi.mocked(useReplacements);
const mockedSelect = vi.mocked(selectReplacement);

// позиции 0-based, как их отдаёт бэкенд
const ME: ChainParticipant = {
  clusterId: 1,
  requestId: 101,
  position: 0,
  isCurrentUser: true,
  offeredItemId: 1,
  offeredItemTitle: 'Велосипед',
  offeredItemDescription: '',
  wantedDescription: 'Хочу фотоаппарат',
  requestStatus: 'ACTIVE',
};

// вакансия — позиция, с которой читатель получал товар (receivesFromPosition)
const DECLINED: ChainParticipant = {
  clusterId: 2,
  requestId: 202,
  position: 1,
  isCurrentUser: false,
  offeredItemId: 2,
  offeredItemTitle: 'Зеркальный фотоаппарат Canon',
  offeredItemDescription: '',
  wantedDescription: 'Хочу велосипед',
  requestStatus: 'ACTIVE',
};

function makeChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 1,
    status: 'PROPOSED',
    score: 0.9,
    length: 2,
    version: 1,
    currentRequestId: 101,
    currentPosition: 0,
    givesToPosition: 1,
    receivesFromPosition: 1,
    createdAt: '',
    updatedAt: '',
    participants: [ME, DECLINED],
    ...overrides,
  };
}

function makeOption(index: number): ReplacementOption {
  return {
    requestId: 1000 + index,
    offeredItemId: 500 + index,
    title: `Кандидат ${index}`,
    description: 'Почти не использовалась',
    wantedDescription: 'Ищу фотоаппарат',
    reliability: 0.82,
    // свежая заявка — метка «Актуальна», чтобы тест не зависел от текущей даты
    respondedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  };
}

function mockOptions(options: ReplacementOption[]) {
  mockedUseReplacements.mockReturnValue({
    data: options,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
}

describe('ChainReplacementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseChain.mockReturnValue({
      data: makeChain(),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
  });

  it('names the declined item so the actor knows which link is vacant', () => {
    mockOptions([makeOption(1)]);

    renderWithProviders(<ChainReplacementPage />);

    expect(
      screen.getByText('Участник с товаром «Зеркальный фотоаппарат Canon» отказался участвовать'),
    ).toBeInTheDocument();
  });

  // пустой пул — единственный выход расформировать цепочку, приглашать некого
  it('offers only to disband the chain when the pool is empty', () => {
    mockOptions([]);

    renderWithProviders(<ChainReplacementPage />);

    expect(screen.getByText('Замен не нашлось')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пригласить замену' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Расформировать цепочку' })).toBeInTheDocument();
  });

  it('renders the first page of candidates and loads the rest on demand', async () => {
    const user = userEvent.setup();
    mockOptions(Array.from({ length: 12 }, (_, index) => makeOption(index)));

    renderWithProviders(<ChainReplacementPage />);

    expect(screen.getAllByRole('radio')).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Показать ещё (2)' }));

    expect(screen.getAllByRole('radio')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /Показать ещё/ })).not.toBeInTheDocument();
  });

  // ровно один кандидат за действие: выбор читается из самого radio, не из класса
  it('keeps the selection to a single candidate', async () => {
    const user = userEvent.setup();
    mockOptions([makeOption(1), makeOption(2)]);

    renderWithProviders(<ChainReplacementPage />);

    const [first, second] = screen.getAllByRole('radio');
    await user.click(first);
    expect(first).toBeChecked();

    await user.click(second);
    expect(second).toBeChecked();
    expect(first).not.toBeChecked();
  });

  it('blocks the invite button until a candidate is picked', async () => {
    const user = userEvent.setup();
    mockOptions([makeOption(1)]);

    renderWithProviders(<ChainReplacementPage />);

    expect(screen.getByRole('button', { name: 'Пригласить замену' })).toBeDisabled();
    await user.click(screen.getAllByRole('radio')[0]);
    expect(screen.getByRole('button', { name: 'Пригласить замену' })).toBeEnabled();
  });

  // барьер повторной отправки: пока PUT в полёте, выбор не меняется и действий нет
  it('freezes the cards and both actions while the invite is in flight', async () => {
    mockedSelect.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    mockOptions([makeOption(1), makeOption(2)]);

    renderWithProviders(<ChainReplacementPage />);

    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: 'Пригласить замену' }));

    await waitFor(() => expect(screen.getAllByRole('radio')[0]).toBeDisabled());
    expect(screen.getAllByRole('radio')[1]).toBeDisabled();
    // в состоянии loading antd подмешивает в имя кнопки свою иконку — сверяем по подстроке
    expect(screen.getByRole('button', { name: /Пригласить замену/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ни одна из замен не подходит' })).toBeDisabled();
  });

  it('shows the waiting screen right after the invitation is accepted by the server', async () => {
    mockedSelect.mockResolvedValue({ chainId: 1, requestId: 1001, status: 'PROPOSED' });
    const user = userEvent.setup();
    mockOptions([makeOption(1)]);

    renderWithProviders(<ChainReplacementPage />);

    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: 'Пригласить замену' }));

    expect(await screen.findByText('Ждём ответа кандидата')).toBeInTheDocument();
    // повторный PUT недоступен: кнопки приглашения на экране ожидания нет вовсе
    expect(screen.queryByRole('button', { name: 'Пригласить замену' })).not.toBeInTheDocument();
    expect(screen.getByText('Кандидат 1')).toBeInTheDocument();
  });

  it('shows the assembled chain once the candidate confirmed', () => {
    mockedUseChain.mockReturnValue({
      data: makeChain({ status: 'FROZEN' }),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockOptions([]);

    renderWithProviders(<ChainReplacementPage />);

    expect(screen.getByText('Замена подтверждена')).toBeInTheDocument();
    expect(screen.getByText('Цепочка собрана')).toBeInTheDocument();
    expect(screen.getByText('2 участника в цепочке')).toBeInTheDocument();
  });

  // откат ведёт на живой экран, а не на удалённую цепочку
  it('explains a rollback caused by the candidate declining', () => {
    mockedUseChain.mockReturnValue({
      data: makeChain({ status: 'CANDIDATE' }),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockOptions([]);

    renderWithProviders(<ChainReplacementPage />);

    expect(screen.getByText('Замена не состоялась')).toBeInTheDocument();
    expect(
      screen.getByText('Кандидат отказался. Цепочка вернулась в список вариантов'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'К вариантам' })).toBeInTheDocument();
  });

  // самый опасный случай: пул для не-PROPOSED цепочки не запрашивается, и старый fallback
  // в 'selecting' предлагал бы расформировать уже идущий обмен
  it('never offers to disband a chain that is already in progress', () => {
    mockedUseChain.mockReturnValue({
      data: makeChain({ status: 'IN_PROGRESS' }),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockOptions([]);

    renderWithProviders(<ChainReplacementPage />);

    expect(screen.getByText('Замена больше не нужна')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Расформировать цепочку' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Замен не нашлось')).not.toBeInTheDocument();
  });

  it('explains a rollback caused by the chain being disbanded', () => {
    mockedUseChain.mockReturnValue({
      data: makeChain({ status: 'BROKEN' }),
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockOptions([]);

    renderWithProviders(<ChainReplacementPage />);

    expect(screen.getByText('Цепочка расформирована')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'К моим запросам' })).toBeInTheDocument();
  });
});
