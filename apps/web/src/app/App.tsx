import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from '@et/shared';
import { DemoDock } from '../demo/DemoDock';
import { BookingPage } from '../features/public/BookingPage';
import { PublicEventPage } from '../features/public/PublicEventPage';
import { PublicEventsPage } from '../features/public/PublicEventsPage';
import { TicketPage } from '../features/public/TicketPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventsPage } from '../features/events/EventsPage';
import { ScannerPage } from '../features/gate/ScannerPage';
import { LoginPage } from '../features/auth/LoginPage';
import { MessagesPage } from '../features/messages/MessagesPage';
import { OrganisersPage } from '../features/organisers/OrganisersPage';
import { TeamPage } from '../features/team/TeamPage';
import { useAuth } from './auth';
import { Shell } from './Shell';

/** Signed-in area: redirects to /login, and bounces roles away from pages they cannot use. */
function Protected({ roles, children }: { roles?: Role[]; children: JSX.Element }) {
  const { user } = useAuth();
  if (user === undefined) return <div className="empty">Loading…</div>;
  if (user === null) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role))
    return <Navigate to={user.role === 'GATE_STAFF' ? '/gate' : '/'} replace />;
  return children;
}

const PANEL: Role[] = ['OWNER', 'ORGANISER'];

export function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* customer-facing, no login */}
        <Route path="/e" element={<PublicEventsPage />} />
        <Route path="/e/:id" element={<PublicEventPage />} />
        <Route path="/b/:id" element={<BookingPage />} />
        <Route path="/t/:code" element={<TicketPage />} />

        <Route
          element={
            <Protected>
              <Shell />
            </Protected>
          }
        >
          <Route
            index
            element={
              <Protected roles={PANEL}>
                <DashboardPage />
              </Protected>
            }
          />
          <Route
            path="organisers"
            element={
              <Protected roles={['OWNER']}>
                <OrganisersPage />
              </Protected>
            }
          />
          <Route
            path="events"
            element={
              <Protected roles={PANEL}>
                <EventsPage />
              </Protected>
            }
          />
          <Route
            path="events/:id"
            element={
              <Protected roles={PANEL}>
                <EventDetailPage />
              </Protected>
            }
          />
          <Route
            path="team"
            element={
              <Protected roles={PANEL}>
                <TeamPage />
              </Protected>
            }
          />
          <Route
            path="messages"
            element={
              <Protected roles={PANEL}>
                <MessagesPage />
              </Protected>
            }
          />
          <Route path="gate" element={<ScannerPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DemoDock />
    </>
  );
}
