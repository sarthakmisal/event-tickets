import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CreatedBookingDto, PublicEventDto } from '@et/shared';
import { createBookingSchema, formatINR } from '@et/shared';
import { Icon } from '../../components/Icon';
import { Button, Field, Input, LoadState, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { errorMessage, useQuery } from '../../lib/hooks';
import { payWithRazorpay } from './checkout';
import { PublicLayout } from './PublicLayout';

function useCountdown(iso: string | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!iso) return undefined;
    const tick = () => setLeft(Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [iso]);
  return left;
}

/** Step 2: the seats are held; the customer pays (mock checkout in dev/demo, Razorpay in production). */
function Checkout({
  event,
  created,
  onPaid,
  onBack,
}: {
  event: PublicEventDto;
  created: CreatedBookingDto;
  onPaid: () => void;
  onBack: () => void;
}) {
  const { booking, payment } = created;
  const left = useCountdown(booking.holdExpiresAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mockOpen, setMockOpen] = useState(false);
  if (!payment) return null;

  async function confirm(input: Parameters<typeof api.public.confirm>[2]) {
    setBusy(true);
    setError('');
    try {
      await api.public.confirm(booking.id, created.accessToken, input);
      onPaid();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function pay() {
    if (!payment) return;
    setError('');
    if (payment.provider === 'mock') {
      setMockOpen(true);
      return;
    }
    try {
      const result = await payWithRazorpay(payment, {
        name: booking.customerName,
        phone: booking.customerPhone,
      });
      if (result) await confirm(result);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const expired = left === 0;
  return (
    <div className="card card-body stack">
      <b style={{ fontSize: 18 }}>Complete payment</b>
      <div className="earn" style={{ padding: 0 }}>
        <div className="earn-row">
          <span>{event.title}</span>
          <b>
            {booking.quantity} × {formatINR(event.pricePaise)}
          </b>
        </div>
        <div className="earn-row total">
          <span>Total</span>
          <b>{formatINR(payment.amountPaise)}</b>
        </div>
      </div>
      <div className="banner">
        <Icon name="clock" />
        {expired
          ? 'Your hold has expired. Please start again.'
          : `Seats held for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
      </div>
      {error && <span className="err">{error}</span>}
      <div className="form-actions">
        <Button variant="primary" busy={busy} disabled={expired} onClick={() => void pay()}>
          Pay {formatINR(payment.amountPaise)}
        </Button>
        <Button onClick={onBack}>Back</Button>
      </div>
      {mockOpen && (
        <Modal title="Test checkout" onClose={() => setMockOpen(false)}>
          <p className="sub">
            This is a stand-in for Razorpay, used while payments run in test mode. Nothing is
            charged.
          </p>
          <div className="row">
            <Button onClick={() => setMockOpen(false)}>Cancel payment</Button>
            <Button
              variant="primary"
              onClick={() => {
                setMockOpen(false);
                void api.public
                  .mockPay(payment.orderId)
                  .then(confirm)
                  .catch((e: unknown) => setError(errorMessage(e)));
              }}
            >
              Pay {formatINR(payment.amountPaise)}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function PublicEventPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const event = useQuery(() => api.public.event(id), [id]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedBookingDto | null>(null);
  const e = event.data;

  const goToBooking = (b: CreatedBookingDto) =>
    navigate(`/b/${b.booking.id}?t=${encodeURIComponent(b.accessToken)}`);

  async function submit() {
    const parsed = createBookingSchema.safeParse({
      customerName: name,
      customerPhone: phone,
      quantity: qty,
      attendeeNames: names
        .slice(0, qty)
        .map((n) => n.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError({ field: issue?.path[0]?.toString(), message: issue?.message ?? 'Invalid input' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.public.book(id, parsed.data);
      if (result.payment) setCreated(result);
      else goToBooking(result);
    } catch (err) {
      setError({
        field:
          err && typeof err === 'object' && 'field' in err
            ? String((err as { field?: string }).field)
            : undefined,
        message: errorMessage(err),
      });
      event.reload();
    } finally {
      setBusy(false);
    }
  }
  const err = (f: string) => (error?.field === f ? error.message : undefined);

  return (
    <PublicLayout>
      <Link className="back" to="/e">
        <Icon name="back" />
        All events
      </Link>
      <LoadState loading={event.loading} error={event.error} onRetry={event.reload} />
      {e && (
        <>
          <div className="ticket">
            <div className="ticket-top">
              <small>{e.organiserName}</small>
              <h3>{e.title}</h3>
              <p>
                <Icon name="calendar" />
                {fmtDateTime(e.startsAt)}
              </p>
              <p>
                <Icon name="pin" />
                {e.venue}
              </p>
            </div>
            <div className="ticket-cut" />
            <div className="ticket-bot">
              <div>
                <b className="num">{e.pricePaise === 0 ? 'Free' : formatINR(e.pricePaise)}</b>
                <small>per ticket</small>
              </div>
              <small>
                {e.open
                  ? e.remaining > 0
                    ? `${e.remaining} left`
                    : 'Sold out'
                  : 'Bookings closed'}
              </small>
            </div>
          </div>
          {e.description && (
            <p className="sub" style={{ maxWidth: 'none' }}>
              {e.description}
            </p>
          )}

          {created ? (
            <Checkout
              event={e}
              created={created}
              onBack={() => setCreated(null)}
              onPaid={() => goToBooking(created)}
            />
          ) : e.open && e.remaining > 0 ? (
            <div className="card card-body stack" style={{ gap: 14 }}>
              <b style={{ fontSize: 18 }}>Book tickets</b>
              <Field label="Your name" error={err('customerName')}>
                <Input
                  value={name}
                  onChange={(ev) => setName(ev.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field
                label="WhatsApp number"
                note="Your tickets are sent here"
                error={err('customerPhone')}
              >
                <Input
                  type="tel"
                  value={phone}
                  onChange={(ev) => setPhone(ev.target.value)}
                  autoComplete="tel"
                  placeholder="9876543210"
                />
              </Field>
              <Field label="Tickets" error={err('quantity')}>
                <div className="stepper">
                  <button
                    type="button"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    aria-label="Fewer"
                  >
                    −
                  </button>
                  <b className="num">{qty}</b>
                  <button
                    type="button"
                    onClick={() =>
                      setQty(Math.min(Math.min(e.maxPerBooking, e.remaining), qty + 1))
                    }
                    aria-label="More"
                  >
                    +
                  </button>
                </div>
              </Field>
              {qty > 1 && (
                <details>
                  <summary className="link" style={{ cursor: 'pointer' }}>
                    Add names for each ticket (optional)
                  </summary>
                  <div className="stack" style={{ gap: 10, marginTop: 12 }}>
                    {Array.from({ length: qty }, (_, i) => (
                      <Field key={i} label={`Ticket ${i + 1}`}>
                        <Input
                          value={names[i] ?? ''}
                          onChange={(ev) =>
                            setNames(Object.assign([...names], { [i]: ev.target.value }))
                          }
                          placeholder={i === 0 ? name || 'Your name' : 'Guest name'}
                        />
                      </Field>
                    ))}
                  </div>
                </details>
              )}
              {error && !error.field && <span className="err">{error.message}</span>}
              <Button variant="primary" busy={busy} onClick={() => void submit()}>
                {e.pricePaise === 0
                  ? 'Get free tickets'
                  : `Continue · ${formatINR(e.pricePaise * qty)}`}
              </Button>
            </div>
          ) : (
            <div className="banner">
              {e.open ? 'This event is sold out.' : 'Bookings for this event are closed.'}
            </div>
          )}
        </>
      )}
    </PublicLayout>
  );
}
