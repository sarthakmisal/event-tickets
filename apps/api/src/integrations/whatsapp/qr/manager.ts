import type { Logger } from '../../../shared/logger';
import { WhatsAppUnavailableError } from '../provider';
import type { WhatsAppProvider } from '../provider';
import type { AuthStore } from './auth-store';
import { WhatsAppSession } from './session';
import type { SessionOptions } from './session';
import type { SessionSnapshot, SocketFactory } from './types';

/** Owner key of the platform's own number, used when an organiser has not linked theirs. */
export const PLATFORM_KEY = 'platform';

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface QrWhatsAppDeps {
  store: AuthStore;
  createSocket: SocketFactory;
  log: Logger;
  minGapMs: number;
  dailyLimit: number;
  /** Test seams. */
  sleep?: SessionOptions['sleep'];
  now?: SessionOptions['now'];
  random?: SessionOptions['random'];
}

/** All linked numbers (platform + one per organiser) and the provider that routes messages to them. */
export function createQrWhatsApp(deps: QrWhatsAppDeps) {
  const sessions = new Map<string, WhatsAppSession>();
  const options: SessionOptions = {
    minGapMs: deps.minGapMs,
    jitterMs: Math.round(deps.minGapMs * 0.8),
    dailyLimit: deps.dailyLimit,
    sleep: deps.sleep ?? realSleep,
    now: deps.now ?? (() => new Date()),
    random: deps.random ?? Math.random,
  };

  const session = (key: string): WhatsAppSession => {
    let found = sessions.get(key);
    if (!found) {
      found = new WhatsAppSession(key, deps.store, deps.createSocket, options, deps.log);
      sessions.set(key, found);
    }
    return found;
  };

  const provider: WhatsAppProvider = {
    name: 'qr',
    async send({ toPhone, body, senderKey }) {
      const keys = [...new Set([senderKey, PLATFORM_KEY])].filter((k): k is string => !!k);
      const ready = keys.map(session).find((s) => s.isConnected());
      if (!ready) throw new WhatsAppUnavailableError('WhatsApp number is not connected');
      await ready.send(toPhone, body);
    },
  };

  return {
    provider,

    /** Reconnects every number that was linked before the restart. */
    async startSaved(): Promise<void> {
      for (const key of await deps.store.listRegistered()) {
        await session(key)
          .start()
          .catch((err) => deps.log.error({ err, key }, 'whatsapp resume failed'));
      }
    },

    snapshot(key: string): SessionSnapshot {
      return session(key).snapshot();
    },

    /** True when messages for this key would be sent by the platform number instead. */
    platformConnected(): boolean {
      return session(PLATFORM_KEY).isConnected();
    },

    async connect(key: string): Promise<SessionSnapshot> {
      await session(key).start();
      return session(key).snapshot();
    },

    async disconnect(key: string): Promise<void> {
      await session(key).disconnect();
    },

    /** Sends through exactly this number (no fallback), for the "Send test" button. */
    async sendVia(key: string, toPhone: string, body: string): Promise<void> {
      await session(key).send(toPhone, body);
    },

    stopAll(): void {
      for (const s of sessions.values()) s.stop();
    },
  };
}

export type QrWhatsApp = ReturnType<typeof createQrWhatsApp>;
