import { useNavigate } from 'react-router';

import { useAppDispatch } from '@app/store/hooks';
import { logout } from '@app/store/slices/userSlice';

import { queryClient } from '@shared/api';

import { logoutRequest } from '../api/authApi';

export function useLogout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  return async function logoutAndRedirect() {
    try {
      // вызов идёт до очистки localStorage — интерцептор ещё приложит актуальный токен
      await logoutRequest();
    } catch {
      // JWT стейтлесс, сервер токен не инвалидирует — при недоступности сети
      // (или истёкшем токене) локальный выход всё равно обязателен
    }
    dispatch(logout());
    // кеш запросов не должен переживать смену аккаунта — иначе следующий юзер увидит чужие товары
    queryClient.clear();
    navigate('/login', { replace: true });
  };
}
