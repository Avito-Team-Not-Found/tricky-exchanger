import { Avatar, Button } from 'antd';
import { useNavigate } from 'react-router';

import { useAppDispatch, useAppSelector } from '@app/store/hooks';
import { toggleTheme } from '@app/store/slices/themeSlice';

import { useLogout } from '@features/auth';

import { ThemeToggle } from '@shared/ui';
import './ProfilePage.scss';

export function ProfilePage() {
  const user = useAppSelector((state) => state.user.user);
  const isDark = useAppSelector((state) => state.theme.mode) === 'dark';
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const handleLogout = useLogout();

  const initials = user?.fullName
    ?.split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="profile">
      <Avatar className="profile__avatar" size={64}>
        {initials ?? '—'}
      </Avatar>
      <h1 className="profile__name">{user?.fullName ?? '—'}</h1>
      <p className="profile__email">{user?.email ?? '—'}</p>
      <div className="profile__theme">
        <span className="profile__theme-label">Тема</span>
        <ThemeToggle checked={isDark} onChange={() => dispatch(toggleTheme())} />
      </div>
      <Button className="profile__password" block onClick={() => navigate('/profile/password')}>
        Сменить пароль
      </Button>
      <Button className="profile__logout" type="primary" danger block onClick={handleLogout}>
        Выйти
      </Button>
    </div>
  );
}
