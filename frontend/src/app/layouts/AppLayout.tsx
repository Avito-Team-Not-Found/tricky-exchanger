import type { ReactNode } from 'react';

import { AppstoreOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons';
import { NavLink, Outlet, useLocation } from 'react-router';

import { useScreenMotionClass } from '@shared/lib/useScreenMotion';
import { BrandLogo } from '@shared/ui';
import './AppLayout.scss';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/products', label: 'Товары', icon: <AppstoreOutlined aria-hidden /> },
  { to: '/exchange-requests', label: 'Запросы', icon: <SwapOutlined aria-hidden /> },
  { to: '/profile', label: 'Профиль', icon: <UserOutlined aria-hidden /> },
];

function navClassName({ isActive }: { isActive: boolean }) {
  return `app-nav-item${isActive ? ' app-nav-item--active' : ''}`;
}

// на экранах форм глобальная шапка не показывается — у экрана своя (назад + заголовок);
// меню (нижний таб-бар / боковое) остаётся на всех брейкпоинтах
const FORM_SCREEN_PATTERNS = [
  /^\/products\/new$/,
  /^\/products\/[^/]+\/edit$/,
  /^\/exchange-requests\/new$/,
  /^\/exchange-requests\/[^/]+\/edit$/,
];

// экраны цепочки — полноэкранный подпоток (макеты 4.7/4.8/4.9): у экрана своя шапка, а низ занимает
// кнопка действия, поэтому глобальной шапки и таб-бара нет. Макеты только мобильные — боковое
// меню десктопа остаётся: там кнопка действия ничего не перекрывает
const FULL_SCREEN_PATTERNS = [/^\/chains\/[^/]+(\/(participants|deal(\/(shipments|receipts))?))?$/];

export function AppLayout() {
  const { pathname } = useLocation();
  const screenMotionClass = useScreenMotionClass();
  const isFullScreen = FULL_SCREEN_PATTERNS.some((pattern) => pattern.test(pathname));
  const isFormScreen = FORM_SCREEN_PATTERNS.some((pattern) => pattern.test(pathname));

  return (
    <div className={`app-layout${isFullScreen ? ' app-layout--full-screen' : ''}`}>
      {!isFormScreen && !isFullScreen ? (
        <header className="app-header">
          <div className="app-header__inner">
            <BrandLogo className="app-header__brand" />
          </div>
        </header>
      ) : null}
      <div className="app-body">
        <aside className="app-side-menu">
          <BrandLogo />
          <nav className="app-side-menu__nav" aria-label="Основная навигация">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClassName}>
                <span className="app-nav-item__icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="app-content">
          {/* key перемонтирует узел при навигации — на этом держится enter-анимация экрана */}
          <div key={pathname} className={`app-content__screen ${screenMotionClass}`}>
            <Outlet />
          </div>
        </main>
      </div>
      {!isFullScreen ? (
        <nav className="app-bottom-nav" aria-label="Основная навигация">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClassName}>
              <span className="app-nav-item__icon">{item.icon}</span>
              <span className="app-nav-item__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
