import { useEffect } from 'react';

import { useAppDispatch } from '@app/store/hooks';
import { sessionRestored } from '@app/store/slices/userSlice';

import { tokenStorage } from '@shared/lib/storage';

import { fetchMeRequest } from '../api/authApi';

// токен из localStorage не содержит свежих данных профиля, поэтому тянем их с сервера;
// протухший токен уже обработан интерцептором apiClient — здесь 401 не разбираем
export function useRestoreSession() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!tokenStorage.get()) return;

    let cancelled = false;

    fetchMeRequest()
      .then((user) => {
        if (!cancelled) dispatch(sessionRestored(user));
      })
      .catch(() => {
        // сетевая ошибка или 401 (обработан интерцептором) — сессию не трогаем
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);
}
