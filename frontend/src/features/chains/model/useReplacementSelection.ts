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
  // запись переживает перезагрузку: иначе экран ожидания превращается обратно в выбор кандидата
  const [invited, setInvited] = useState(() => replacementInvited.get(chainId));
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
      invited !== null && current?.status === 'PROPOSED' ? WAITING_POLL_INTERVAL : false,
  });

  // пул кандидатов существует только пока цепочка PROPOSED; при FROZEN/CANDIDATE/BROKEN запрос
  // не нужен вовсе (вернул бы 409) — экран там рендерится по статусу цепочки.
  // В ожидании пул опрашивается наравне с цепочкой: отказ приглашённого статус цепочки не меняет,
  // и вновь открывшуюся вакансию видно только по нему (см. vacancyReopened).
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

  // Как только цепочка увидена вне PROPOSED, вакансии больше нет и сохранённый флаг протух:
  // снимаем его, чтобы следующая замена по этой же цепочке начиналась с выбора кандидата,
  // а не с чужого экрана ожидания. Это единственное, что ограничивает время жизни ключа.
  const chainStatus = chain?.status;
  useEffect(() => {
    if (chainStatus && chainStatus !== 'PROPOSED') {
      replacementInvited.clear(chainId);
    }
  }, [chainId, chainStatus]);

  // Приглашённый кандидат может отказаться сам. Цепочку это не откатывает: сервер снова открывает
  // вакансию на его позиции (быстрая замена), статус остаётся PROPOSED — и по нему это состояние
  // неотличимо от «ждём ответа». Единственный признак — пул: пока приглашение в силе, вакансии нет
  // и пул пуст, а непустой пул означает, что позиция снова свободна и выбирать нужно заново.
  // Приглашённого в свежем пуле уже нет (он занял позицию в цепочке), поэтому его наличие в списке
  // читается как «данные ещё от прошлого выбора» и приглашение не отменяет — иначе гонка
  // с инвалидацией сразу после PUT выбрасывала бы актора обратно в 'selecting'.
  const invitedRequestId = invited?.requestId ?? null;
  const vacancyReopened =
    invited !== null &&
    chain?.status === 'PROPOSED' &&
    options.length > 0 &&
    !options.some((option) => option.requestId === invitedRequestId);
  // экран уходит в 'selecting' по вычисленному признаку, а не по состоянию: эффект лишь снимает
  // протухшую запись, чтобы перезагрузка не вернула актора на «Ждём ответа кандидата»
  useEffect(() => {
    if (vacancyReopened) replacementInvited.clear(chainId);
  }, [chainId, vacancyReopened]);

  const isChainNotFound = isAxiosError(chainError) && chainError.response?.status === 404;
  const stage: ReplacementStage = isChainNotFound
    ? 'rolledBack'
    : replacementStage(chain?.status, invited !== null && !vacancyReopened);
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
    mutationFn: (option: ReplacementOption) =>
      selectReplacement(chainId as number, option.requestId),
    onSuccess: (_result, option) => {
      setInvited({ requestId: option.requestId, option });
      replacementInvited.set(chainId, option);
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
    inviteInFlight.current = true;
    inviteMutation.mutate(selectedOption, {
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
    // карточка приглашённого переживает перезагрузку вместе с записью: без неё экран ожидания
    // после возврата на страницу показывал бы «пустую» замену
    invitedOption: vacancyReopened ? null : (invited?.option ?? null),
  };
}
