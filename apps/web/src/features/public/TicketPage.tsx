import { useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { TicketStatePill } from '../../components/status';
import { LoadState, QrImage } from '../../components/ui';
import { api } from '../../lib/api';
import { ticketLink } from '../../lib/config';
import { fmtDateTime } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { PublicLayout } from './PublicLayout';

export function TicketPage() {
  const { code = '' } = useParams();
  const data = useQuery(() => api.public.ticket(code), [code], 5000);
  const v = data.data;
  return (
    <PublicLayout>
      <LoadState loading={data.loading} error={data.error} onRetry={data.reload} />
      {v && (
        <div className="ticket">
          <div className="ticket-top">
            <small>Admit one</small>
            <h3>{v.eventTitle}</h3>
            <p>
              <Icon name="calendar" />
              {fmtDateTime(v.startsAt)}
            </p>
            <p>
              <Icon name="pin" />
              {v.venue}
            </p>
          </div>
          <div className="ticket-cut" />
          <div className="ticket-bot" style={{ flexDirection: 'column', gap: 14 }}>
            <b>{v.ticket.attendeeName}</b>
            <div className="qr-box">
              <QrImage value={ticketLink(v.ticket.code)} size={200} label="Ticket QR" />
            </div>
            <code className="vchip">{v.ticket.code}</code>
            <TicketStatePill state={v.ticket.state} />
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
