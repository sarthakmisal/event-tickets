import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthStore } from '../src/integrations/whatsapp/qr/auth-store';
import { WhatsAppSession } from '../src/integrations/whatsapp/qr/session';
import type { SessionOptions } from '../src/integrations/whatsapp/qr/session';
import { WhatsAppUnavailableError } from '../src/integrations/whatsapp/provider';
import { createLogger } from '../src/shared/logger';
import { fakeSocketFactory } from './fake-whatsapp';

const log = createLogger('silent');
const store = (registered: boolean): AuthStore =>
  ({
    load: async () => ({
      state: { creds: { registered }, keys: {} },
      saveCreds: async () => undefined,
    }),
    markRegistered: async () => undefined,
    clear: async () => undefined,
    listRegistered: async () => [],
  }) as unknown as AuthStore;

function make(over: Partial<SessionOptions> = {}, registered = true) {
  const { factory, sockets } = fakeSocketFactory();
  const sleeps: number[] = [];
  let nowMs = Date.parse('2026-11-22T10:00:00Z');
  const session = new WhatsAppSession(
    'k',
    store(registered),
    factory,
    {
      minGapMs: 5000,
      jitterMs: 4000,
      dailyLimit: 3,
      sleep: async (ms) => {
        sleeps.push(ms);
        nowMs += ms;
      },
      now: () => new Date(nowMs),
      random: () => 0.5,
      ...over,
    },
    log,
  );
  return { session, sockets, sleeps, setNow: (iso: string) => (nowMs = Date.parse(iso)) };
}

afterEach(() => vi.useRealTimers());

describe('sending safety', () => {
  it('spaces messages out by the minimum gap plus jitter', async () => {
    const { session, sockets, sleeps } = make();
    await session.start();
    sockets[0]!.emit({ connection: 'open', userPhone: '911' });
    await session.send('9822222222', 'one');
    await session.send('9822222222', 'two');
    expect(sockets[0]!.sent.map((m) => m.text)).toEqual(['one', 'two']);
    expect(sleeps).toEqual([7000]); // 5000 + 0.5 * 4000; the first message needs no wait
  });

  it('stops at the daily limit with a retryable error, and resets the next day', async () => {
    const { session, sockets, setNow } = make({ minGapMs: 0, jitterMs: 0 });
    await session.start();
    sockets[0]!.emit({ connection: 'open', userPhone: '911' });
    for (const n of [1, 2, 3]) await session.send('9822222222', `m${n}`);
    await expect(session.send('9822222222', 'm4')).rejects.toBeInstanceOf(WhatsAppUnavailableError);
    setNow('2026-11-23T10:00:00Z');
    await session.send('9822222222', 'm4');
    expect(sockets[0]!.sent).toHaveLength(4);
  });

  it('refuses to send while not connected', async () => {
    const { session } = make();
    await expect(session.send('9822222222', 'x')).rejects.toBeInstanceOf(WhatsAppUnavailableError);
  });
});

describe('reconnecting', () => {
  it('reconnects a linked number with growing backoff, and resets after success', async () => {
    vi.useFakeTimers();
    const { session, sockets } = make();
    await session.start();
    sockets[0]!.emit({ connection: 'open', userPhone: '911' });

    sockets[0]!.emit({ connection: 'close', closeCode: 428 });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.snapshot().state).toBe('CONNECTING');
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.emit({ connection: 'close', closeCode: 408 }); // second failure -> 2s
    await vi.advanceTimersByTimeAsync(1999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);

    sockets[2]!.emit({ connection: 'open', userPhone: '911' });
    expect(session.snapshot().state).toBe('CONNECTED');
    sockets[2]!.emit({ connection: 'close', closeCode: 428 }); // backoff restarted at 1s
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(4);
  });

  it('stop() closes without logging out so the next boot can resume', async () => {
    const { session, sockets } = make();
    await session.start();
    sockets[0]!.emit({ connection: 'open', userPhone: '911' });
    session.stop();
    expect(sockets[0]!.closed).toBe(true);
    expect(sockets[0]!.loggedOut).toBe(false);
    expect(session.snapshot().state).toBe('DISCONNECTED');
  });
});
