import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';

import { acceptChain, declineChain, deselectChain, selectChain, type Chain } from '@entities/chain';

import { getErrorMessage } from '@shared/lib/errorMessage';

type ResponseKind = 'accept' | 'decline';

// Отклик и выбор цепочки (PROJECT.md §4.4–4.5): подтверждение действия и тосты живут здесь,
// чтобы ChainCard и ChainDetail не дублировали ни модалки, ни мутации.
export function useChainActions(onConflict?: () => void) {
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();

  const respond = useMutation({
    mutationFn: ({ chainId, kind }: { chainId: string; kind: ResponseKind }) =>
      kind === 'accept' ? acceptChain(chainId) : declineChain(chainId),
    onSuccess: (data) => {
      message.success(
        data.isReadyForSelection ? 'Цепочка собрана — можно выбрать' : 'Ответ отправлен',
      );
      // и список вариантов, и открытая карточка цепочки показывают свежие статусы откликов
      queryClient.invalidateQueries({ queryKey: ['chains'] });
    },
    onError: (error) => {
      // конфликт статуса или истёкший дедлайн — кнопка отклика осталась на экране, перезагружаем
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      message.error(
        getErrorMessage(
          error,
          { 409: 'Вы уже ответили на эту цепочку', 410: 'Время на ответ истекло' },
          'Не удалось отправить отклик',
        ),
      );
    },
  });

  // выбор и его отмена — одна мутация-тумблер: обе стороны инвалидируют один и тот же кэш
  const select = useMutation({
    mutationFn: ({ chainId, selected }: { chainId: string; selected: boolean }) =>
      selected ? selectChain(chainId) : deselectChain(chainId),
    onSuccess: (_data, { selected }) => {
      message.success(selected ? 'Цепочка выбрана' : 'Выбор отменён');
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      queryClient.invalidateQueries({ queryKey: ['exchange-requests'] });
    },
    onError: (error, { selected }) => {
      // конфликт статуса — данные на экране устарели, обновляем список, чтобы был виден актуальный выбор
      message.error(
        getErrorMessage(
          error,
          { 409: 'Цепочка изменилась: обновите список вариантов.' },
          selected ? 'Не удалось выбрать цепочку' : 'Не удалось отменить выбор',
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      onConflict?.();
    },
  });

  function confirmResponse(chain: Chain, kind: ResponseKind) {
    const isAccept = kind === 'accept';
    modal.confirm({
      title: isAccept ? 'Принять участие в цепочке?' : 'Отказаться от цепочки?',
      content: isAccept
        ? 'Вы подтверждаете участие в этой цепочке обмена.'
        : 'Вы откажетесь от участия. Вернуться будет нельзя, цепочка останется без вас.',
      okText: isAccept ? 'Да, принять' : 'Да, отказаться',
      okButtonProps: isAccept ? { type: 'primary' } : { danger: true },
      cancelText: 'Отмена',
      onOk: () => respond.mutate({ chainId: chain.id, kind }),
    });
  }

  // выбор ничего не блокирует и обратим, поэтому подтверждения не требует (DESIGN.md §2.7)
  function chooseChain(chain: Chain) {
    select.mutate({ chainId: chain.id, selected: true });
  }

  // отмена выбора — только через Modal-подтверждение (DESIGN.md §3.4)
  function confirmCancelChoice(chain: Chain) {
    modal.confirm({
      title: 'Отменить выбор цепочки?',
      content: 'Цепочка вернётся в список вариантов, её можно будет выбрать снова.',
      okText: 'Да, отменить',
      okButtonProps: { danger: true },
      cancelText: 'Нет',
      onOk: () => select.mutate({ chainId: chain.id, selected: false }),
    });
  }

  return {
    confirmResponse,
    chooseChain,
    confirmCancelChoice,
    isResponding: respond.isPending,
    isSelecting: select.isPending,
  };
}
