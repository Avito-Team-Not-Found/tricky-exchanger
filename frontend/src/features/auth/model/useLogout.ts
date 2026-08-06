import { useNavigate } from 'react-router';

import { useAppDispatch } from '@app/store/hooks';
import { logout } from '@app/store/slices/userSlice';

import { queryClient } from '@shared/api';

export function useLogout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  return function logoutAndRedirect() {
    dispatch(logout());
    // кеш запросов не должен переживать смену аккаунта — иначе следующий юзер увидит чужие товары
    queryClient.clear();
    navigate('/login', { replace: true });
  };
}
