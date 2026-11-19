import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { BookingStatusPill, TicketStatePill } from '../../components/status';
import { LoadState, QrImage } from '../../components/ui';
import { api } from '../../lib/api';
import { ticketLink } from '../../lib/config';
import { fmtDateTime, formatINR } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { PublicLayout } from './PublicLayout';

/** The page behind the WhatsApp link: booking status and one QR per ticket. */
export function BookingPage() {
  const { id = '' } = useParams();
  const token = useSearchParams()[0].get('t') ?? '';
  const data = useQuery(() => api.public.booking(id, token), [id, token], 4000);
  const view = data.data;
  const b = view?.booking;

  return (
    <PublicLayout>
      <LoadState loading={data.loading} error={data.error} onRetry={data.reload} />
      {view && b && (
        <>
          <div>
            <div className="eyebrow">Your booking</div>
            <h1>{view.event.title}</h1>
            <div className="meta">
              <span>
                <Icon name="calendar" />
                {fmtDateTime(view.event.startsAt)}
              </span>
              <span>
                <Icon name="pin" />
                {view.event.venue}
              </span>
            </div>
          </div>
          <div
            className="card card-body"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <b>{b.customerName}</b>
              <span className="cell-sub">
                {b.quantity} ticket(s) · {b.amountPaise === 0 ? 'Free' : formatINR(b.amountPaise)}
              </span>
            </div>
            <BookingStatusPill status={b.status} />
          </div>
          {b.status === 'PENDING' && (
            <div className="banner">
              <Icon name="clock" />
              Waiting for payment. This page updates automatically.
            </div>
          )}
          {b.status === 'EXPIRED' && (
            <div className="banner">
              <Icon name="alert" />
              This booking expired before payment. If money was deducted it will be refunded.
            </div>
          )}
          {b.needsRefund && (
            <div className="banner">
              <Icon name="alert" />
              Your payment will be refunded by the organiser.
            </div>
          )}
          {b.status === 'PAID' && b.tickets.length > 0 && (
            <>
              <p className="sub">Show the QR at the gate. Each person scans their own ticket.</p>
              <div className="pub-list">
                {b.tickets.map((t) => (
                  <div key={t.id} className="card qr-card">
                    <b>{t.attendeeName}</b>
                    <div className="qr-box">
                      <QrImage
                        value={ticketLink(t.code)}
                        size={176}
                        label={`QR for ${t.attendeeName}`}
                      />
                    </div>
                    <code className="vchip">{t.code}</code>
                    <TicketStatePill state={t.state} />
                    <Link className="link" to={`/t/${t.code}`}>
                      Open ticket →
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </PublicLayout>
  );
}
