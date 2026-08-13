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

import { declineMessage } from './declineMessage';
import { replacementInvited } from './replacementInvited';
import { replacementStage, type ReplacementStage } from './replacementStage';

const WAITING_POLL_INTERVAL = 15_000;

export function useReplacementSelection(chainId?: number) {
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();
  const queryClient = useQueryClient();
  // запись переживает перезагрузку: иначе экран ожидания превращается обратно в выбор кандидата
  const [invited, setInvited] = useState(() => replacementInvited.get(chainId));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // синхронный барьер повторного PUT: isPending становится true только после ререндера
  const inviteInFlight = useRef(false);

  // роутер переиспользует элемент между /chains/1 и /chains/2/replacement, размонтирования нет —
  // без пересинхронизации лениво поднятое приглашение утекло бы в соседнюю цепочку
  const [renderedChainId, setRenderedChainId] = useState(chainId);
  if (renderedChainId !== chainId) {
    setRenderedChainId(chainId);
    setInvited(replacementInvited.get(chainId));
    setSelectedId(null);
  }

  const {
    data: chain,
    isLoading: isChainLoading,
    isError: isChainError,
    error: chainError,
    refetch: refetchChain,
  } = useChain(chainId, {
    refetchInterval: (current) =>
      invited !== null && current?.status === 'PROPOSED' ? WAITING_POLL_INTERVAL : false,
  });

  // вне PROPOSED пула не существует и запрос вернул бы 409
  const {
    data: options = [],
    isLoading: isListLoading,
    isError: isListError,
    refetch: refetchOptions,
  } = useReplacements(chainId, {
    enabled: chain?.status === 'PROPOSED',
    refetchInterval:
      invited !== null && chain?.status === 'PROPOSED' ? WAITING_POLL_INTERVAL : false,
  });

  // единственное, что ограничивает время жизни записи: иначе следующая замена по этой же
  // цепочке началась бы сразу с экрана ожидания
  const chainStatus = chain?.status;
  useEffect(() => {
    if (chainStatus && chainStatus !== 'PROPOSED') {
      replacementInvited.clear(chainId);
    }
  }, [chainId, chainStatus]);

  // отказ приглашённого статус цепочки не меняет, так что открывшуюся заново вакансию видно
  // только по непустому пулу; сам приглашённый в свежем пуле уже отсутствует, и его наличие
  // читается как данные от прошлого выбора — иначе гонка с инвалидацией после PUT сбросила бы stage
  const invitedRequestId = invited?.requestId ?? null;
  const vacancyReopened =
    invited !== null &&
    chain?.status === 'PROPOSED' &&
    options.length > 0 &&
    !options.some((option) => option.requestId === invitedRequestId);
  useEffect(() => {
    if (vacancyReopened) replacementInvited.clear(chainId);
  }, [chainId, vacancyReopened]);

  const isChainNotFound = isAxiosError(chainError) && chainError.response?.status === 404;
  const stage: ReplacementStage = isChainNotFound
    ? 'rolledBack'
    : replacementStage(chain?.status, invited !== null && !vacancyReopened);
  const isLoading = isListLoading || isChainLoading;
  // 404 цепочки — не ошибка загрузки, а штатный откат; ошибка пула валит экран только там, где
  // пул нужен, иначе его 403/409 на закрытой вакансии подменил бы экран ожидания
  const isError = (isChainError && !isChainNotFound) || (stage === 'selecting' && isListError);

  function refetch() {
    void refetchChain();
    void refetchOptions();
  }

  // после фонового refetch выбранная заявка может исчезнуть — кнопка приглашения гаснет сама
  const selectedOption = options.find((option) => option.requestId === selectedId) ?? null;

  const inviteMutation = useMutation({
    mutationFn: (option: ReplacementOption) =>
      selectReplacement(chainId as number, option.requestId),
    onSuccess: (_result, option) => {
      setInvited({ requestId: option.requestId, option });
      replacementInvited.set(chainId, option);
      // и карточка цепочки, и пул замен лежат под ['chains'] — одна инвалидация покрывает оба
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      // свой ключ со staleTime 60s: иначе «Варианты обмена» ещё минуту показывают прежний состав
      queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
    },
    onError: (error) => {
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
        // актор сменился или вакансия закрыта — повторять нечего
        if (status === 403) {
          navigate(`/chains/${chainId}`);
          return;
        }
        if (status === 404) {
          navigate('/exchange-requests');
          return;
        }
        if (status === 409) {
          queryClient.invalidateQueries({ queryKey: ['chains'] });
          return;
        }
      }
      refetchOptions();
    },
  });

  function invite() {
    if (inviteInFlight.current || selectedOption === null) return;
    inviteInFlight.current = true;
    inviteMutation.mutate(selectedOption, {
      onSettled: () => {
        inviteInFlight.current = false;
      },
    });
  }

  const abandonMutation = useMutation({
    mutationFn: () => declineChain(chainId as number),
    onSuccess: (result) => {
      // цепочки для нас больше нет — увидеть её в другом статусе и снять запись уже негде
      replacementInvited.clear(chainId);
      queryClient.invalidateQueries({ queryKey: ['chains'] });
      // расформированная цепочка обязана исчезнуть из списка сразу, а не висеть минуту (staleTime)
      queryClient.invalidateQueries({ queryKey: ['exchange-options'] });
      // сервер вправе откатить цепочку в CANDIDATE или оставить PROPOSED под подбор замены —
      // обещать «расформирована» заранее нельзя, исход берём из ответа
      message.success(
        result.status === 'BROKEN' ? 'Цепочка расформирована' : declineMessage(result.status),
      );
      // из цепочки мы вышли при любом исходе, так что /chains/{id} для нас закрыт
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

  function abandon() {
    modal.confirm({
      title: 'Отказаться от замены?',
      content: 'Вы выйдете из цепочки: если заменить вас будет некем, она расформируется',
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
    invitedOption: vacancyReopened ? null : (invited?.option ?? null),
  };
}
