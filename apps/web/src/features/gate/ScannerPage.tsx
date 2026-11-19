import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ScanMode, ScanResultDto } from '@et/shared';
import { Icon } from '../../components/Icon';
import { Button, Empty, Field, Input, PageHead, Pill, Select } from '../../components/ui';
import { api, demo } from '../../lib/api';
import { fmtTime } from '../../lib/format';
import { errorMessage, useQuery } from '../../lib/hooks';
import { cameraScanSupported, useCamera } from './useCamera';

export function ScannerPage() {
  const events = useQuery(() => api.gate.events(), [], 10_000);
  const [eventId, setEventId] = useState('');
  const [mode, setMode] = useState<ScanMode>('ENTRY');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResultDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!eventId && events.data?.[0]) setEventId(events.data[0].id);
  }, [events.data, eventId]);

  const recent = useQuery(
    () => (eventId ? api.gate.recent(eventId) : Promise.resolve([])),
    [eventId],
    4000,
  );
  const current = events.data?.find((e) => e.id === eventId);

  async function scan(value: string) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.gate.scan({ code: value, mode, eventId: eventId || undefined });
      setResult(res);
      setCode('');
      recent.reload();
      events.reload();
      navigator.vibrate?.(res.ok ? 60 : [80, 60, 80]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const video = useCamera(cameraOn, (v) => void scan(v));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void scan(code);
  };

  return (
    <>
      <PageHead
        eyebrow="Entry & exit"
        title="Gate scanner"
        sub="Pick the event, choose Entry or Exit, then scan the ticket QR or type its code."
      />
      <div className="scan stack">
        <div className="card card-body stack" style={{ gap: 16 }}>
          <Field label="Event">
            <Select
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setResult(null);
              }}
            >
              {events.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
              {events.data?.length === 0 && <option value="">No live events</option>}
            </Select>
          </Field>
          <div className="seg" role="radiogroup" aria-label="Scan mode" style={{ width: '100%' }}>
            {(['ENTRY', 'EXIT'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                style={{ flex: 1, padding: '12px 0', fontSize: 15 }}
                onClick={() => setMode(m)}
              >
                {m === 'ENTRY' ? 'Entry' : 'Exit'}
              </button>
            ))}
          </div>
          {current && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Pill tone="good" live>
                {current.inside} inside
              </Pill>
              <span className="cell-sub">{current.sold} tickets sold</span>
            </div>
          )}
          {cameraOn && <video ref={video} className="cam" muted playsInline />}
          <form onSubmit={submit} className="test-row">
            <Field label="Ticket code or QR link">
              <Input
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 7K3M9Q2XPA"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
              />
            </Field>
            <Button variant="primary" type="submit" busy={busy} disabled={!code.trim() || !eventId}>
              <Icon name="check" />
              {mode === 'ENTRY' ? 'Check in' : 'Check out'}
            </Button>
          </form>
          {cameraScanSupported() && (
            <Button onClick={() => setCameraOn((v) => !v)}>
              <Icon name="scan" />
              {cameraOn ? 'Stop camera' : 'Scan with camera'}
            </Button>
          )}
          {error && <span className="err">{error}</span>}
        </div>

        {result && (
          <div className={`scan-result ${result.ok ? 'good' : 'bad'}`} role="status">
            <Icon name={result.ok ? 'check' : 'x'} />
            <div>
              <b>{result.message}</b>
              <span>
                {result.attendeeName ?? result.code}
                {result.inside !== null ? ` · ${result.inside} inside` : ''}
              </span>
            </div>
          </div>
        )}

        {demo && eventId && <DemoCodes eventId={eventId} onPick={setCode} />}

        <div className="card">
          <div className="card-head">
            <h2>Recent scans</h2>
          </div>
          {recent.data?.map((s) => (
            <div key={s.id} className="entry">
              <Pill tone={s.ok ? 'good' : 'bad'}>
                {s.ok ? (s.mode === 'ENTRY' ? 'In' : 'Out') : 'Rejected'}
              </Pill>
              <div>
                <b>{s.attendeeName ?? s.code}</b>
                {s.reason && (
                  <span className="cell-sub">{s.reason.replace(/_/g, ' ').toLowerCase()}</span>
                )}
              </div>
              <span className="t">
                {fmtTime(s.createdAt)}
                <br />
                {s.scannedBy}
              </span>
            </div>
          ))}
          {recent.data?.length === 0 && <Empty title="No scans yet" />}
        </div>
      </div>
    </>
  );
}

/** Demo only: tickets that exist in the in-memory store, so scanning can be tried without a phone. */
function DemoCodes({ eventId, onPick }: { eventId: string; onPick: (code: string) => void }) {
  const codes = useQuery(() => Promise.resolve(demo?.ticketCodes(eventId) ?? []), [eventId], 2000);
  if (!codes.data?.length) return null;
  return (
    <div className="card card-body">
      <b style={{ display: 'block', marginBottom: 8 }}>Demo tickets — tap to fill</b>
      <div className="chips">
        {codes.data.slice(-8).map((t) => (
          <button
            key={t.code}
            type="button"
            className="vchip"
            onClick={() => onPick(t.code)}
            title={t.attendeeName}
          >
            {t.code} · {t.state.toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
