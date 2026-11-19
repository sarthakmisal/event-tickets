import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/Icon';
import { EventStatusPill } from '../../components/status';
import { Empty, LoadState, PageHead } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime, formatINR } from '../../lib/format';
import { useQuery } from '../../lib/hooks';

function Kpi({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: IconName;
  tone: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className={`chip ${tone}`}>
          <Icon name={icon} />
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value num">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function DashboardPage() {
  const summary = useQuery(() => api.dashboard.get(), [], 8000);
  const events = useQuery(() => api.events.list(), [], 8000);
  const d = summary.data;
  const owner = d?.scope === 'platform';

  return (
    <>
      <PageHead
        eyebrow={owner ? 'Platform' : 'Organiser'}
        title="Dashboard"
        sub={owner ? 'Everything across all organisers.' : 'Sales and entry for your events.'}
      />
      {d?.pendingMessages ? (
        <div className="banner">
          <Icon name="chat" /> {d.pendingMessages} WhatsApp message(s) not delivered yet.{' '}
          <Link to="/messages">Review</Link>
        </div>
      ) : null}
      <LoadState loading={summary.loading} error={summary.error} onRetry={summary.reload} />
      {d && (
        <div className="kpis">
          <Kpi
            icon="rupee"
            tone="green"
            label="Gross sales"
            value={formatINR(d.grossPaise)}
            sub={`${d.paidBookings} paid booking(s)`}
          />
          {owner ? (
            <Kpi
              icon="store"
              tone="indigo"
              label="Your commission"
              value={formatINR(d.platformFeePaise)}
              sub={`${d.organisers} organiser(s)`}
            />
          ) : (
            <Kpi
              icon="rupee"
              tone="indigo"
              label="Your earnings"
              value={formatINR(d.organiserSharePaise)}
              sub="After platform commission"
            />
          )}
          <Kpi
            icon="ticket"
            tone="sky"
            label="Tickets sold"
            value={String(d.ticketsSold)}
            sub={`${d.liveEvents} live event(s)`}
          />
          <Kpi
            icon="users"
            tone="amber"
            label="Inside right now"
            value={String(d.inside)}
            sub="Checked in, not yet out"
          />
        </div>
      )}
      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <h2>Events</h2>
            <Link className="link" to="/events">
              View all →
            </Link>
          </div>
          <div className="tbl stack-tbl">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>When</th>
                  <th>Sold</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.data?.slice(0, 5).map((e) => (
                  <tr key={e.id}>
                    <td className="full">
                      <Link className="ev-name" to={`/events/${e.id}`}>
                        {e.title}
                      </Link>
                      <span className="cell-sub">{e.organiserName}</span>
                    </td>
                    <td data-label="When">{fmtDateTime(e.startsAt)}</td>
                    <td data-label="Sold" className="num">
                      {e.sold}/{e.capacity}
                    </td>
                    <td data-label="Status">
                      <EventStatusPill status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.data?.length === 0 && <Empty title="No events yet" />}
          </div>
        </div>
        {d && (
          <div className="card">
            <div className="card-head">
              <h2>Where the money goes</h2>
            </div>
            <div className="earn">
              <div className="earn-row">
                <span>Gross sales</span>
                <b>{formatINR(d.grossPaise)}</b>
              </div>
              <div className="earn-row">
                <span>Platform commission</span>
                <b>{formatINR(d.platformFeePaise)}</b>
              </div>
              <div className="earn-row total">
                <span>Organiser share</span>
                <b className="rec">{formatINR(d.organiserSharePaise)}</b>
              </div>
              <div className="payout">
                <small>Payouts</small>
                <b>Tracked, not automated</b>
                <small style={{ fontWeight: 500, marginTop: 4 }}>
                  Collected via Razorpay. Settlement to organisers is handled manually for now.
                </small>
              </div>
              <p className="cell-sub" style={{ marginTop: 12 }}>
                Commission is set per organiser and locked in on each event when it is created.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
