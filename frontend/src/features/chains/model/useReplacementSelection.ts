import { useEffect, useRef, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router';

import {
  declineChain,
  selectReplacement,
  useChain,
  useReplacements,
  type ReplacementOption,
} from '@entities/chain';

import { getErrorMessage } from '@shared/lib/errorMessage';

import { replacementInvited } from './replacementInvited';
import { replacementStage, type ReplacementStage } from './replacementStage';

const WAITING_POLL_INTERVAL = 15_000;

// Вся логика экрана замены (TZ §6.4): страница — «глупый» рендер по stage.
export function useReplacementSelection(chainId?: number) {
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  // флаг переживает перезагрузку: иначе экран ожидания превращается обратно в выбор кандидата
  const [invited, setInvited] = useState(() => replacementInvited.get(chainId));
  const [invitedOption, setInvitedOption] = useState<ReplacementOption | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // синхронный барьер повторного PUT: isPending становится true только после ререндера (TZ §7.2)
  const inviteInFlight = useRef(false);

  // опрос включается только в состоянии ожидания ответа кандидата (TZ §4) и гаснет сам, как
  // только цепочка ушла из PROPOSED, — дальше экран рендерится по её статусу
  const {
    data: chain,
    isLoading: isChainLoading,
    isError: isChainError,
    error: chainError,
    refetch: refetchChain,
  } = useChain(chainId, {
    refetchInterval: (current) =>
      invited && current?.status === 'PROPOSED' ? WAITING_POLL_INTERVAL : false,
  });

  // пул кандидатов существует только пока цепочка PROPOSED; при FROZEN/CANDIDATE/BROKEN запрос
  // не нужен вовсе (вернул бы 409) — экран там рендерится по статусу цепочки
  const {
    data: options = [],
    isLoading: isListLoading,
    isError: isListError,
    refetch: refetchOptions,
  } = useReplacements(chainId, { enabled: chain?.status === 'PROPOSED' });

  // Как только цепочка увидена вне PROPOSED, вакансии больше нет и сохранённый флаг протух:
  // снимаем его, чтобы следующая замена по этой же цепочке начиналась с выбора кандидата,
  // а не с чужого экрана ожидания. Это единственное, что ограничивает время жизни ключа.
  const chainStatus = chain?.status;
  useEffect(() => {
    if (chainStatus && chainStatus !== 'PROPOSED') {
      replacementInvited.clear(chainId);
    }
  }, [chainId, chainStatus]);

  const isChainNotFound = isAxiosError(chainError) && chainError.response?.status === 404;
  const stage: ReplacementStage = isChainNotFound
    ? 'rolledBack'
    : replacementStage(chain?.status, invited);
  const isLoading = isListLoading || isChainLoading;
  // 404 цепочки — не ошибка загрузки, а штатный откат («Замена не состоялась»)
  // Ошибка пула валит экран только там, где пул вообще нужен: запрос остаётся включённым весь
  // waiting (цепочка ещё PROPOSED), и его 403/409 на уже закрытой вакансии иначе подменял бы
  // «Ждём ответа кандидата» общей ошибкой.
  const isError = (isChainError && !isChainNotFound) || (stage === 'selecting' && isListError);

  // повторить нужно то, что упало: обычно это цепочка, а не пул (ErrorState на странице один)
  function refetch() {
    void refetchChain();
    void refetchOptions();
  }

  // выбор живёт в state, но существует только пока кандидат есть в свежем пуле: после фонового
  // refetch выбранная заявка может исчезнуть, и кнопка приглашения обязана погаснуть сама
  const selectedOption = options.find((option) => option.requestId === selectedId) ?? null;

  const inviteMutation = useMutation({
    mutationFn: (requestId: number) => selectReplacement(chainId as number, requestId),
    onSuccess: () => {
      setInvited(true);
      replacementInvited.set(chainId);
      // и карточка цепочки, и пул замен лежат под ['chains'] — одна инвалидация покрывает оба
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      // список вариантов заявки живёт под своим ключом со staleTime 60s: без инвалидации
      // экран «Варианты обмена» ещё минуту показывал бы цепочку в прежнем составе
      queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
    },
    onError: (error) => {
      // список протухающий: конфликт — повод перезапросить, а не повторить действие (TZ §1)
      message.error(
        getErrorMessage(
          error,
          {
            403: 'Замену уже выбрали',
            404: 'Цепочка не найдена',
            409: 'Цепочка изменилась: обновите варианты',
            422: 'Этот вариант больше не доступен',
          },
          'Не удалось пригласить замену',
        ),
      );
      if (isAxiosError(error) && error.response) {
        const status = error.response.status;
        // актор сменился или вакансия закрыта — на живой экран цепочки, повторять нечего
        if (status === 403) {
          navigate(`/chains/${chainId}`);
          return;
        }
        if (status === 404) {
          navigate('/exchange-requests');
          return;
        }
        if (status === 409) {
          // цепочка ушла из PROPOSED — перезапрашиваем цепочку, экран сам уйдёт в верный stage
          queryClient.invalidateQueries({ queryKey: ['chains'] });
          return;
        }
      }
      refetchOptions();
    },
  });

  function invite() {
    if (inviteInFlight.current || selectedOption === null) return;
    const option = selectedOption;
    inviteInFlight.current = true;
    inviteMutation.mutate(option.requestId, {
      onSuccess: () => setInvitedOption(option),
      onSettled: () => {
        inviteInFlight.current = false;
      },
    });
  }

  const abandonMutation = useMutation({
    mutationFn: () => declineChain(chainId as number),
    onSuccess: () => {
      // цепочки больше нет — увидеть её в другом статусе и снять флаг уже негде
      replacementInvited.clear(chainId);
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      // уходим прямо на список вариантов заявки — расформированная цепочка обязана исчезнуть
      // из него сразу, а не висеть кликабельной минуту (staleTime)
      queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
      message.success('Цепочка расформирована');
      // цепочки больше нет — возврат на /chains/{id} дал бы 404 (TZ §3.3)
      const requestId = chain?.currentRequestId;
      navigate(requestId ? `/exchange-requests/${requestId}` : '/exchange-requests');
    },
    onError: (error) => {
      message.error(
        getErrorMessage(
          error,
          { 403: 'Это не ваша цепочка', 404: 'Цепочка не найдена' },
          'Не удалось расформировать цепочку',
        ),
      );
    },
  });

  // действие необратимо (TZ §3.3) — обязательный Modal.confirm с danger-кнопкой
  function abandon() {
    modal.confirm({
      title: 'Отказаться от замены?',
      content: 'Цепочка будет расформирована, заявки вернутся в поиск',
      okText: 'Да, отказаться',
      okButtonProps: { danger: true },
      cancelText: 'Нет',
      onOk: () => abandonMutation.mutate(),
    });
  }

  return {
    options,
    isLoading,
    isError,
    refetch,
    selectedId: selectedOption?.requestId ?? null,
    setSelectedId,
    invite,
    isInviting: inviteMutation.isPending,
    abandon,
    isAbandoning: abandonMutation.isPending,
    stage,
    chain,
    invitedOption,
  };
}
