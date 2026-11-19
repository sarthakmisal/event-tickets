import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';

/** Chrome for customer pages: no sidebar, no login. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pub">
      <header className="pub-head">
        <Link to="/e" className="brand" style={{ padding: 0 }}>
          <span className="mark">
            <Icon name="logoMark" />
          </span>
          <b style={{ color: 'var(--ink)' }}>Event Tickets</b>
        </Link>
        <Link to="/login" className="link" style={{ fontSize: 13 }}>
          Organiser login
        </Link>
      </header>
      <main className="pub-main">{children}</main>
    </div>
  );
}
