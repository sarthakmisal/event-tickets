import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Empty, LoadState } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime, formatINR } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { PublicLayout } from './PublicLayout';

export function PublicEventsPage() {
  const events = useQuery(() => api.public.events(), []);
  return (
    <PublicLayout>
      <h1>Upcoming events</h1>
      <LoadState loading={events.loading} error={events.error} onRetry={events.reload} />
      <div className="pub-list">
        {events.data?.map((e) => (
          <Link key={e.id} to={`/e/${e.id}`} className="card pub-card">
            <b>{e.title}</b>
            <span className="meta">
              <span>
                <Icon name="calendar" />
                {fmtDateTime(e.startsAt)}
              </span>
              <span>
                <Icon name="pin" />
                {e.venue}
              </span>
            </span>
            <span className="pub-card-foot">
              <b className="num">{e.pricePaise === 0 ? 'Free' : formatINR(e.pricePaise)}</b>
              <span className="cell-sub">
                {e.remaining > 0 ? `${e.remaining} left` : 'Sold out'}
              </span>
            </span>
          </Link>
        ))}
      </div>
      {events.data?.length === 0 && <Empty title="No events open for booking right now" />}
    </PublicLayout>
  );
}
