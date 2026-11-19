import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { EventStatusPill } from '../../components/status';
import { Empty, LoadState, PageHead, useToast } from '../../components/ui';
import { Button } from '../../components/ui';
import { useUser } from '../../app/auth';
import { api } from '../../lib/api';
import { fmtDateTime, formatINR, percent } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { EventForm } from './EventForm';

export function EventsPage() {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const events = useQuery(() => api.events.list(), []);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHead
        eyebrow="Manage"
        title="Events"
        sub="Create an event, publish it, and share the booking link."
      >
        {user.role === 'ORGANISER' && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            New event
          </Button>
        )}
      </PageHead>
      <div className="card">
        <LoadState loading={events.loading} error={events.error} onRetry={events.reload} />
        {events.data && (
          <div className="tbl stack-tbl">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>When</th>
                  <th>Price</th>
                  <th>Sold</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.data.map((e) => (
                  <tr key={e.id}>
                    <td className="full">
                      <Link className="ev-name" to={`/events/${e.id}`}>
                        {e.title}
                      </Link>
                      <span className="cell-sub">
                        {user.role === 'OWNER' ? `${e.organiserName} · ` : ''}
                        {e.venue}
                      </span>
                    </td>
                    <td data-label="When">{fmtDateTime(e.startsAt)}</td>
                    <td data-label="Price" className="num">
                      {e.pricePaise === 0 ? 'Free' : formatINR(e.pricePaise)}
                    </td>
                    <td data-label="Sold">
                      <span className="num">
                        {e.sold}/{e.capacity}
                      </span>
                      <div className="bar" style={{ marginTop: 6 }}>
                        <i style={{ width: `${percent(e.sold, e.capacity)}%` }} />
                      </div>
                    </td>
                    <td data-label="Status">
                      <EventStatusPill status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.data.length === 0 && (
              <Empty title="No events yet">
                {user.role === 'ORGANISER'
                  ? 'Create your first event.'
                  : 'Organisers have not created any events.'}
              </Empty>
            )}
          </div>
        )}
      </div>
      {creating && (
        <EventForm
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            const created = await api.events.create(input);
            toast('Draft created — publish it when ready');
            navigate(`/events/${created.id}`);
          }}
        />
      )}
    </>
  );
}
