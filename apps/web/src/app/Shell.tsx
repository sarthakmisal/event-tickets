import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { Role } from '@et/shared';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { Avatar } from '../components/ui';
import { useAuth, useUser } from './auth';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: IconName;
  roles: Role[];
  end?: boolean;
}

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    short: 'Home',
    icon: 'home',
    roles: ['OWNER', 'ORGANISER'],
    end: true,
  },
  { to: '/organisers', label: 'Organisers', short: 'Orgs', icon: 'store', roles: ['OWNER'] },
  {
    to: '/events',
    label: 'Events',
    short: 'Events',
    icon: 'calendar',
    roles: ['OWNER', 'ORGANISER'],
  },
  {
    to: '/gate',
    label: 'Gate scan',
    short: 'Scan',
    icon: 'scan',
    roles: ['OWNER', 'ORGANISER', 'GATE_STAFF'],
  },
  {
    to: '/team',
    label: 'Gate staff',
    short: 'Staff',
    icon: 'users',
    roles: ['OWNER', 'ORGANISER'],
  },
  {
    to: '/messages',
    label: 'WhatsApp',
    short: 'Chats',
    icon: 'chat',
    roles: ['OWNER', 'ORGANISER'],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Platform owner',
  ORGANISER: 'Organiser',
  GATE_STAFF: 'Gate staff',
};

function toggleTheme() {
  const root = document.documentElement;
  const dark =
    root.dataset.theme === 'dark' ||
    (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'light' : 'dark';
}

export function Shell() {
  const user = useUser();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const close = () => setOpen(false);

  return (
    <>
      <div className={`app ${open ? 'menu-open' : ''}`}>
        <aside className="sidebar" aria-label="Main navigation">
          <div className="brand">
            <span className="mark">
              <Icon name="logoMark" />
            </span>
            <div>
              <b>Event Tickets</b>
              <small>{user.organiserName ?? 'Platform'}</small>
            </div>
          </div>
          <nav className="nav">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="nav-item" onClick={close}>
                <Icon name={n.icon} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            <Avatar name={user.name} />
            <div className="who">
              <b>{user.name}</b>
              <small>{ROLE_LABEL[user.role]}</small>
            </div>
            <button
              className="icon-btn"
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              <Icon name="sun" />
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => void logout()}
              aria-label="Sign out"
            >
              <Icon name="logout" />
            </button>
          </div>
        </aside>
        <div className="backdrop" onClick={close} />
        <div style={{ minWidth: 0 }}>
          <header className="topbar">
            <span className="mark">
              <Icon name="logoMark" />
            </span>
            <b>Event Tickets</b>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Icon name="menu" />
            </button>
          </header>
          <main className="main">
            <div className="view">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="Quick navigation">
        {items.slice(0, 5).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `bn ${isActive ? 'active' : ''}`}
          >
            <Icon name={n.icon} />
            {n.short}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
