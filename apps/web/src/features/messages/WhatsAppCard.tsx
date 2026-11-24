import { useEffect, useState } from 'react';
import { Button, Field, Input, Pill, QrImage, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage, useQuery } from '../../lib/hooks';

/** Link a WhatsApp number by scanning a QR, like WhatsApp Web. Hidden when the server does not offer it. */
export function WhatsAppCard() {
  const toast = useToast();
  // Poll fast only while a QR / connection is in progress; otherwise just keep the card fresh.
  const [pollMs, setPollMs] = useState(2500);
  const status = useQuery(() => api.whatsapp.status(), [], pollMs);
  const live = status.data?.state === 'QR' || status.data?.state === 'CONNECTING';
  useEffect(() => setPollMs(live ? 2500 : 15000), [live]);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const wa = status.data;
  if (!wa?.supported) return null;

  const owner = wa.scope === 'PLATFORM';

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await action();
      if (done) toast(done);
      status.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  const tone = wa.state === 'CONNECTED' ? 'good' : wa.state === 'DISCONNECTED' ? 'warn' : 'accent';
  const label = {
    DISCONNECTED: 'Not connected',
    CONNECTING: 'Connecting…',
    QR: 'Scan to connect',
    CONNECTED: 'Connected',
  }[wa.state];

  return (
    <section className="card wa-card" aria-label="WhatsApp number">
      <div className="card-head">
        <div>
          <h2>{owner ? 'Platform WhatsApp number' : 'Your WhatsApp number'}</h2>
          <p className="hint">
            {wa.state === 'CONNECTED'
              ? `Ticket confirmations are sent from +${wa.phone ?? ''}.`
              : owner
                ? 'Link a number to send ticket confirmations automatically. Use a dedicated SIM, not a personal number.'
                : wa.fallbackConnected
                  ? 'Until you link your own number, confirmations go out from the platform number.'
                  : 'Link your own number to send ticket confirmations automatically.'}
          </p>
        </div>
        <Pill tone={tone}>{label}</Pill>
      </div>

      {wa.error && wa.state === 'DISCONNECTED' && <p className="err wa-pad">{wa.error}</p>}

      {wa.state === 'QR' && wa.qr && (
        <div className="wa-qr">
          <QrImage value={wa.qr} size={200} label="WhatsApp link QR code" />
          <ol className="wa-steps">
            <li>Open WhatsApp on the phone with this number</li>
            <li>Tap Settings, then Linked devices, then Link a device</li>
            <li>Scan this code. It refreshes by itself</li>
          </ol>
        </div>
      )}

      {wa.state === 'CONNECTED' && (
        <div className="wa-test">
          <Field label="Send a test message to">
            <Input
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Button
            busy={busy}
            disabled={phone.length !== 10}
            onClick={() => void run(() => api.whatsapp.sendTest(phone), 'Test message sent')}
          >
            Send test
          </Button>
        </div>
      )}

      <div className="wa-actions">
        {wa.state === 'DISCONNECTED' && (
          <Button
            variant="primary"
            busy={busy}
            onClick={() => void run(() => api.whatsapp.connect())}
          >
            Connect WhatsApp
          </Button>
        )}
        {wa.state !== 'DISCONNECTED' && (
          <Button
            busy={busy}
            onClick={() =>
              void run(
                () => api.whatsapp.disconnect(),
                wa.state === 'CONNECTED' ? 'WhatsApp disconnected' : undefined,
              )
            }
          >
            {wa.state === 'CONNECTED' ? 'Disconnect' : 'Cancel'}
          </Button>
        )}
      </div>
    </section>
  );
}
