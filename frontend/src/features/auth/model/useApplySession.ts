import { useNavigate } from 'react-router';

import { useAppDispatch } from '@app/store/hooks';
import { loginSucceeded } from '@app/store/slices/userSlice';

import type { AuthResponse } from '../api/authApi';

export function useApplySession() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  return function applySession(session: AuthResponse) {
    dispatch(loginSucceeded(session));
    navigate('/products', { replace: true });
  };
}
