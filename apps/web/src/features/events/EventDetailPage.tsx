import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { EventStatus } from '@et/shared';
import { bpsToPercent } from '@et/shared';
import { Icon } from '../../components/Icon';
import { BookingStatusPill, EventStatusPill, TicketStatePill } from '../../components/status';
import { Button, Empty, LoadState, Modal, PageHead, QrImage, useToast } from '../../components/ui';
import { useUser } from '../../app/auth';
import { api } from '../../lib/api';
import { eventLink } from '../../lib/config';
import { fmtDateTime, formatINR } from '../../lib/format';
import { errorMessage, useQuery } from '../../lib/hooks';
import { EventForm } from './EventForm';

export function EventDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const toast = useToast();
  const event = useQuery(() => api.events.get(id), [id], 6000);
  const bookings = useQuery(() => api.bookings.list(id), [id], 6000);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const e = event.data;

  async function setStatus(status: EventStatus) {
    setBusy(true);
    try {
      await api.events.update(id, { status });
      toast(
        status === 'PUBLISHED'
          ? 'Event is live'
          : status === 'CANCELLED'
            ? 'Event cancelled'
            : 'Moved back to draft',
      );
      event.reload();
      bookings.reload();
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  const link = eventLink(id);
  const paid = bookings.data?.filter((b) => b.status === 'PAID') ?? [];
  const gross = paid.reduce((n, b) => n + b.amountPaise, 0);
  const share = paid.reduce((n, b) => n + b.organiserSharePaise, 0);

  return (
    <>
      <PageHead
        back={
          <Link className="back" to="/events">
            <Icon name="back" />
            Events
          </Link>
        }
        eyebrow={e?.organiserName}
        title={e?.title ?? 'Event'}
        sub={e ? `${fmtDateTime(e.startsAt)} · ${e.venue}` : undefined}
      >
        {e && (
          <div className="form-actions">
            <EventStatusPill status={e.status} />
            {e.status !== 'CANCELLED' && (
              <Button size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {e.status === 'DRAFT' && (
              <Button
                size="sm"
                variant="primary"
                busy={busy}
                onClick={() => void setStatus('PUBLISHED')}
              >
                Publish
              </Button>
            )}
            {e.status === 'PUBLISHED' && e.sold === 0 && (
              <Button size="sm" busy={busy} onClick={() => void setStatus('DRAFT')}>
                Unpublish
              </Button>
            )}
            {e.status !== 'CANCELLED' && (
              <Button size="sm" variant="danger" onClick={() => setConfirmCancel(true)}>
                Cancel event
              </Button>
            )}
          </div>
        )}
      </PageHead>
      <LoadState loading={event.loading} error={event.error} onRetry={event.reload} />
      {e && (
        <div className="kpis">
          <div className="card kpi">
            <span className="kpi-label">Sold</span>
            <div className="kpi-value num">
              {e.sold}
              <small style={{ fontSize: 16, color: 'var(--muted)' }}>/{e.capacity}</small>
            </div>
            <div className="kpi-sub">
              {e.held > 0 ? `${e.held} held while paying` : `${e.remaining} left`}
            </div>
          </div>
          <div className="card kpi">
            <span className="kpi-label">Inside now</span>
            <div className="kpi-value num">{e.inside}</div>
            <div className="kpi-sub">Entry scanned, exit not yet</div>
          </div>
          <div className="card kpi">
            <span className="kpi-label">Gross</span>
            <div className="kpi-value num">{formatINR(gross)}</div>
            <div className="kpi-sub">
              {e.pricePaise === 0 ? 'Free event' : `${formatINR(e.pricePaise)} per ticket`}
            </div>
          </div>
          <div className="card kpi">
            <span className="kpi-label">{user.role === 'OWNER' ? 'Commission' : 'Your share'}</span>
            <div className="kpi-value num">
              {formatINR(user.role === 'OWNER' ? gross - share : share)}
            </div>
            <div className="kpi-sub">{bpsToPercent(e.commissionBps)}% commission on this event</div>
          </div>
        </div>
      )}
      <div className="split">
        <div className="card">
          <div className="card-head">
            <h2>Bookings</h2>
            <span className="hint">{paid.length} paid</span>
          </div>
          <div className="tbl stack-tbl">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Qty</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Tickets</th>
                </tr>
              </thead>
              <tbody>
                {bookings.data?.map((b) => (
                  <tr key={b.id}>
                    <td className="full">
                      <b>{b.customerName}</b>
                      <span className="cell-sub">
                        {b.customerPhone} · {fmtDateTime(b.createdAt)}
                      </span>
                    </td>
                    <td data-label="Qty" className="num">
                      {b.quantity}
                    </td>
                    <td data-label="Amount" className="num">
                      {b.amountPaise === 0 ? 'Free' : formatINR(b.amountPaise)}
                    </td>
                    <td data-label="Status">
                      <BookingStatusPill status={b.status} />
                      {b.needsRefund && (
                        <span className="cell-sub" style={{ color: 'var(--bad)' }}>
                          Refund due
                        </span>
                      )}
                    </td>
                    <td data-label="Tickets" className="full">
                      {b.tickets.map((t) => (
                        <div
                          key={t.id}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}
                        >
                          <code className="vchip">{t.code}</code>
                          <TicketStatePill state={t.state} />
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bookings.data?.length === 0 && (
              <Empty title="No bookings yet">Share the booking link to start selling.</Empty>
            )}
          </div>
        </div>
        <div className="card qr-card">
          <b>Booking link</b>
          <div className="qr-box">
            <QrImage value={link} size={168} label="Booking link QR" />
          </div>
          <div className="url">{link}</div>
          <div className="form-actions">
            <Button
              size="sm"
              onClick={() =>
                void navigator.clipboard?.writeText(link).then(() => toast('Link copied'))
              }
            >
              <Icon name="copy" />
              Copy
            </Button>
            <Link className="btn sm" to={`/e/${id}`}>
              Open page
            </Link>
          </div>
          {e?.status !== 'PUBLISHED' && (
            <span className="cell-sub">Only live events accept bookings.</span>
          )}
        </div>
      </div>
      {editing && e && (
        <EventForm
          event={e}
          onClose={() => setEditing(false)}
          onSubmit={async (input) => {
            await api.events.update(id, input);
            toast('Event updated');
            setEditing(false);
            event.reload();
          }}
        />
      )}
      {confirmCancel && (
        <Modal title="Cancel this event?" onClose={() => setConfirmCancel(false)}>
          <p className="sub">
            Sales stop, all tickets become void and paid bookings are flagged for refund. This
            cannot be undone.
          </p>
          <div className="row">
            <Button onClick={() => setConfirmCancel(false)}>Keep event</Button>
            <Button variant="danger" busy={busy} onClick={() => void setStatus('CANCELLED')}>
              Cancel event
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
