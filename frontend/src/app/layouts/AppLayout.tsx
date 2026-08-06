import type { ReactNode } from 'react';

import { AppstoreOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons';
import { NavLink, Outlet } from 'react-router';

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

export function AppLayout() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__inner">
          <BrandLogo className="app-header__brand" />
        </div>
      </header>
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
          <Outlet />
        </main>
      </div>
      <nav className="app-bottom-nav" aria-label="Основная навигация">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={navClassName}>
            <span className="app-nav-item__icon">{item.icon}</span>
            <span className="app-nav-item__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
