import type { ReactNode } from 'react';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmReceipt, useChain, type Chain } from '@entities/chain';

import { renderWithProviders } from '@shared/testing/renderWithProviders';

import { DealPage } from './DealPage';

function queryOk(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() } as never;
}

vi.mock('@entities/chain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/chain')>();
  return { ...actual, useChain: vi.fn(), confirmReceipt: vi.fn() };
});

const mockedUseChain = vi.mocked(useChain);
const mockedReceipt = vi.mocked(confirmReceipt);

function makeChain(status: Chain['status']): Chain {
  const locked = status === 'FROZEN';
  return {
    id: 1,
    status,
    score: 0.9,
    length: 2,
    version: 1,
    currentRequestId: 101,
    currentPosition: 1,
    givesToPosition: 0,
    receivesFromPosition: 2,
    freezeDeadlineAt: '2099-08-10T12:00:00Z',
    createdAt: '',
    updatedAt: '',
    participants: [
      {
        clusterId: 1,
        requestId: 101,
        position: 1,
        isCurrentUser: true,
        offeredItemId: 1,
        offeredItemTitle: 'Мой товар',
        offeredItemDescription: '',
        wantedDescription: 'Хочу их товар',
        requestStatus: locked ? 'LOCKED' : 'IN_PROGRESS',
      },
      {
        clusterId: 2,
        requestId: 202,
        position: 2,
        isCurrentUser: false,
        offeredItemId: 2,
        offeredItemTitle: 'Их товар',
        offeredItemDescription: '',
        wantedDescription: 'Хочу мой товар',
        requestStatus: locked ? 'LOCKED' : 'IN_PROGRESS',
      },
    ],
  };
}

// я уже отправил, сосед ещё нет — ветка shipped-waiting «Вы отправили товар»
function makeShippedWaitingChain(): Chain {
  const chain = makeChain('IN_PROGRESS');
  chain.participants[1].requestStatus = 'LOCKED';
  return chain;
}

// экран рендерится через настоящий роут с параметром :chainId — иначе catch-all роут теста
// не передаёт useParams и навигация «Назад»/редиректы ломаются
function renderDealPage(routes: { path: string; element: ReactNode }[] = []) {
  return renderWithProviders(<div />, {
    initialEntries: ['/chains/1/deal'],
    routes: [{ path: '/chains/:chainId/deal', element: <DealPage /> }, ...routes],
  });
}

describe('DealPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the ship screen with a photo-gated handoff button', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain('FROZEN')));

    renderDealPage();

    expect(screen.getByText('Что нужно сделать')).toBeInTheDocument();
    expect(screen.getByText('Где будем получать?')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Я отправил товар' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Прикрепите фото товара перед отправкой')).toBeInTheDocument();
  });

  it('renders the delivered screen with a green success hero and enabled receipt button', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain('IN_PROGRESS')));

    const { container } = renderDealPage();

    expect(screen.getByText('Все товары доставлены')).toBeInTheDocument();
    // «Все товары доставлены» — зелёный блок
    const hero = container.querySelector('.deal-hero--success');
    expect(hero).toBeInTheDocument();
    expect(hero).toHaveTextContent('Все товары доставлены');
    const button = screen.getByRole('button', { name: 'Я забрал товар' });
    expect(button).toBeEnabled();
  });

  it('renders the waiting screen with an "N из M отправлено" counter and no extra link', () => {
    mockedUseChain.mockReturnValue(queryOk(makeShippedWaitingChain()));

    renderDealPage();

    expect(screen.getByText('Вы отправили товар')).toBeInTheDocument();
    expect(screen.getByText('1 из 2 отправлено')).toBeInTheDocument();
    // статусы отправки открываются кнопкой «Посмотреть детали цепочки» — отдельной ссылки нет
    expect(screen.queryByRole('button', { name: 'Статусы отправки' })).not.toBeInTheDocument();
  });

  // на «Вы отправили товар» модалка безопасности та же, что и на отправке, — про отправку,
  // а не про доставку
  it('opens the shipping-safety modal on the waiting screen, not a delivery one', async () => {
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeShippedWaitingChain()));

    renderDealPage();

    await user.click(screen.getByRole('button', { name: 'Ваш товар в безопасности' }));

    // модалка живёт в портале — ищем её по роли dialog
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/товары не будут отправлены, пока все участники не принесли их/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/получить товары только тогда, когда все товары будут доставлены/),
    ).not.toBeInTheDocument();
  });

  it('labels the waiting items as "Отправлен"/"Ожидает отправки" without checkmarks', () => {
    mockedUseChain.mockReturnValue(queryOk(makeShippedWaitingChain()));

    renderDealPage();

    expect(screen.getByText('Отправлен')).toBeInTheDocument();
    expect(screen.getByText('Ожидает отправки')).toBeInTheDocument();
    expect(screen.queryByText('В пути')).not.toBeInTheDocument();
  });

  it('opens the shipment statuses from the details button on the waiting screen', async () => {
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeShippedWaitingChain()));

    renderDealPage([
      { path: '/chains/:chainId/deal/shipments', element: <div>статусы отправки</div> },
    ]);

    await user.click(screen.getByRole('button', { name: 'Посмотреть детали цепочки' }));
    expect(await screen.findByText('статусы отправки')).toBeInTheDocument();
  });

  it('renders the completed screen', () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain('COMPLETED')));

    renderDealPage();

    expect(screen.getByText('Обмен завершён')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'К моим запросам' })).toBeInTheDocument();
  });

  it('redirects to the chain screen when the deal is not reachable', async () => {
    mockedUseChain.mockReturnValue(queryOk(makeChain('PROPOSED')));

    renderDealPage([{ path: '/chains/:chainId', element: <div>детали цепочки</div> }]);

    expect(await screen.findByText('детали цепочки')).toBeInTheDocument();
  });

  it('shows the received confirmation modal after the receipt without a confirm dialog', async () => {
    mockedReceipt.mockResolvedValue({ chainId: 1, requestId: 202, status: 'IN_PROGRESS' });
    mockedUseChain.mockReturnValue(queryOk(makeChain('IN_PROGRESS')));
    const user = userEvent.setup();

    renderDealPage();

    await user.click(screen.getByRole('button', { name: 'Я забрал товар' }));

    await waitFor(() => expect(mockedReceipt).toHaveBeenCalledWith(1, 202));
    // подтверждение получения не требуется — «Забрать товар?» не показывается
    expect(screen.queryByText('Забрать товар?')).not.toBeInTheDocument();
    expect(await screen.findByText('Получение подтверждено')).toBeInTheDocument();
  });

  it('opens the receipt statuses from the details button on the received screen', async () => {
    const user = userEvent.setup();
    // источник DONE — ветка received-waiting «Вы забрали товар»
    const chain = makeChain('IN_PROGRESS');
    chain.participants[1].requestStatus = 'DONE';
    mockedUseChain.mockReturnValue(queryOk(chain));

    renderDealPage([
      { path: '/chains/:chainId/deal/receipts', element: <div>статусы получения</div> },
    ]);

    expect(screen.getByText('Вы забрали товар')).toBeInTheDocument();
    // отдельной ссылки на статусы нет — они открываются «Посмотреть детали цепочки»
    expect(screen.queryByRole('button', { name: 'Статусы получения' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Посмотреть детали цепочки' }));
    expect(await screen.findByText('статусы получения')).toBeInTheDocument();
  });

  it('gates the dispute on a selected reason and then shows the complaint modal', async () => {
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeChain('IN_PROGRESS')));

    renderDealPage();

    await user.click(screen.getByRole('button', { name: 'Открыть спор' }));

    // модалка живёт в портале — ищем её по роли dialog, чтобы не спутать с кнопкой экрана
    const dialog = await screen.findByRole('dialog');
    const withinDialog = within(dialog);
    // пока причина не выбрана — кнопка «Открыть спор» в модалке недоступна
    const confirm = withinDialog.getByRole('button', { name: 'Открыть спор' });
    expect(confirm).toBeDisabled();
    for (const reason of ['Товар не тот', 'Товар испорчен', 'Другое']) {
      expect(withinDialog.getByRole('radio', { name: reason })).toBeInTheDocument();
    }

    await user.click(withinDialog.getByRole('radio', { name: 'Товар испорчен' }));
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(await screen.findByText('Жалоба отправлена')).toBeInTheDocument();
  });

  it('does not open a dispute when the reason modal is cancelled', async () => {
    const user = userEvent.setup();
    mockedUseChain.mockReturnValue(queryOk(makeChain('IN_PROGRESS')));

    renderDealPage();

    await user.click(screen.getByRole('button', { name: 'Открыть спор' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    // jsdom не доигрывает анимации antd — модалка остаётся в DOM с классом ухода
    await waitFor(() => expect(document.querySelector('.ant-modal')).toHaveClass('ant-zoom-leave'));
    // спор не открыт: строка «Проблемы с товаром?» с кнопкой на месте, «Жалоба на рассмотрении» нет
    expect(screen.getByText('Проблемы с товаром?')).toBeInTheDocument();
    expect(screen.queryByText('Жалоба на рассмотрении')).not.toBeInTheDocument();
  });
});
