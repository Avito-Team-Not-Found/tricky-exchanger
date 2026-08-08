import { useEffect } from 'react';

import { useAppDispatch } from '@app/store/hooks';
import { sessionRestored } from '@app/store/slices/userSlice';

import { tokenStorage } from '@shared/lib/storage';

import { fetchMeRequest } from '../api/authApi';

// Восстановление сессии при перезагрузке страницы: токен из localStorage сам по себе
// не содержит свежих данных профиля, поэтому тянем их с сервера (GET /auth/me).
// Протухший токен (401) уже обработан интерцептором apiClient — он чистит хранилище
// и редиректит на /login, здесь отдельная обработка не нужна.
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
