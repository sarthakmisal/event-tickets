import type { Logger } from '../../../shared/logger';
import { WhatsAppUnavailableError } from '../provider';
import type { AuthStore } from './auth-store';
import type { SessionSnapshot, SocketFactory, WaSocket, WaState, ConnectionUpdate } from './types';

export interface SessionOptions {
  /** Minimum pause between two sends; a random extra up to `jitterMs` is added. */
  minGapMs: number;
  jitterMs: number;
  /** Messages per day per number. Sending too much, too fast is what gets numbers banned. */
  dailyLimit: number;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  random: () => number;
}

const LOGGED_OUT = 401;
const FORBIDDEN = 403;
const TIMED_OUT = 408;
const RESTART_REQUIRED = 515; // WhatsApp asks for a fresh socket right after the QR is scanned
const MAX_BACKOFF_MS = 30_000;

/** One linked WhatsApp number: connect/QR/reconnect state machine plus a throttled sender. */
export class WhatsAppSession {
  private state: WaState = 'DISCONNECTED';
  private qr: string | null = null;
  private phone: string | null = null;
  private lastError: string | null = null;
  private socket: WaSocket | null = null;
  private wanted = false;
  private registered = false;
  private retries = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private sendChain: Promise<unknown> = Promise.resolve();
  private lastSentAt = 0;
  private sentToday = { day: '', count: 0 };

  constructor(
    readonly ownerKey: string,
    private readonly store: AuthStore,
    private readonly createSocket: SocketFactory,
    private readonly opts: SessionOptions,
    private readonly log: Logger,
  ) {}

  snapshot(): SessionSnapshot {
    return { state: this.state, qr: this.qr, phone: this.phone, error: this.lastError };
  }

  isConnected(): boolean {
    return this.state === 'CONNECTED' && this.socket !== null;
  }

  /** Starts (or resumes) the connection. Safe to call repeatedly. */
  async start(): Promise<void> {
    this.wanted = true;
    if (this.socket) return;
    this.lastError = null;
    this.state = 'CONNECTING';
    await this.open();
  }

  /** Unlinks the number from this app (also removes the device on the phone) and forgets the session. */
  async disconnect(): Promise<void> {
    this.wanted = false;
    this.clearTimer();
    const socket = this.socket;
    this.socket = null;
    try {
      await socket?.logout();
    } catch (err) {
      this.log.warn({ err, ownerKey: this.ownerKey }, 'whatsapp logout failed');
    }
    socket?.close();
    await this.store.clear(this.ownerKey);
    this.reset();
  }

  /** Process shutdown: close the socket but keep the link so the next boot reconnects. */
  stop(): void {
    this.wanted = false;
    this.clearTimer();
    this.socket?.close();
    this.socket = null;
    this.state = 'DISCONNECTED';
    this.qr = null;
  }

  /** Sends one text, one at a time, with a human-like gap and a daily cap. */
  send(toPhone: string, body: string): Promise<void> {
    const run = this.sendChain.then(() => this.sendNow(toPhone, body));
    this.sendChain = run.catch(() => undefined);
    return run;
  }

  private async sendNow(toPhone: string, body: string): Promise<void> {
    this.assertConnected();
    const day = this.opts.now().toISOString().slice(0, 10);
    if (this.sentToday.day !== day) this.sentToday = { day, count: 0 };
    if (this.sentToday.count >= this.opts.dailyLimit) {
      throw new WhatsAppUnavailableError(
        'Daily WhatsApp sending limit reached; will retry tomorrow',
      );
    }
    const gap = this.opts.minGapMs + this.opts.random() * this.opts.jitterMs;
    const wait = this.lastSentAt + gap - this.opts.now().getTime();
    if (wait > 0) await this.opts.sleep(wait);
    const socket = this.assertConnected();

    const jid = await socket.resolve(toPhone.replace(/\D/g, ''));
    if (!jid) throw new Error('This number is not on WhatsApp');
    await socket.sendText(jid, body);
    this.lastSentAt = this.opts.now().getTime();
    this.sentToday.count += 1;
  }

  private assertConnected(): WaSocket {
    if (this.state !== 'CONNECTED' || !this.socket) {
      throw new WhatsAppUnavailableError('WhatsApp number is not connected');
    }
    return this.socket;
  }

  private async open(): Promise<void> {
    try {
      const auth = await this.store.load(this.ownerKey);
      this.registered = auth.state.creds.registered === true;
      const socket = await this.createSocket(auth, this.log);
      this.socket = socket;
      socket.onUpdate((update) => this.onUpdate(socket, update));
    } catch (err) {
      this.log.error({ err, ownerKey: this.ownerKey }, 'whatsapp connect failed');
      this.socket = null;
      this.scheduleReconnect();
    }
  }

  private onUpdate(socket: WaSocket, update: ConnectionUpdate): void {
    if (socket !== this.socket) return; // an old socket still talking
    if (update.qr) {
      this.state = 'QR';
      this.qr = update.qr;
    }
    if (update.connection === 'open') {
      this.state = 'CONNECTED';
      this.qr = null;
      this.registered = true;
      this.retries = 0;
      this.phone = update.userPhone ?? this.phone;
      void this.store
        .markRegistered(this.ownerKey, this.phone ?? '')
        .catch((err) => this.log.error({ err }, 'whatsapp markRegistered failed'));
    }
    if (update.connection === 'close') void this.onClose(update.closeCode);
  }

  private async onClose(code: number | undefined): Promise<void> {
    this.log.info({ ownerKey: this.ownerKey, code }, 'whatsapp connection closed');
    this.socket?.close();
    this.socket = null;
    this.qr = null;
    if (!this.wanted) {
      this.state = 'DISCONNECTED';
      return;
    }
    if (code === LOGGED_OUT || code === FORBIDDEN) {
      // Unlinked from the phone (or the number was restricted): the saved session is useless.
      this.log.warn({ ownerKey: this.ownerKey, code }, 'whatsapp session ended');
      this.lastError =
        code === FORBIDDEN
          ? 'WhatsApp restricted this number'
          : 'Logged out from the phone. Scan the QR again to reconnect';
      this.wanted = false;
      await this.store.clear(this.ownerKey).catch(() => undefined);
      this.reset();
      return;
    }
    if (code === TIMED_OUT && !this.registered) {
      // QR was never scanned: stop instead of generating QR codes forever.
      this.lastError = 'QR was not scanned in time, or WhatsApp could not be reached. Try again';
      this.wanted = false;
      await this.store.clear(this.ownerKey).catch(() => undefined);
      this.reset();
      return;
    }
    this.state = 'CONNECTING';
    if (code === RESTART_REQUIRED) {
      await this.open();
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.wanted) {
      this.state = 'DISCONNECTED';
      return;
    }
    this.state = 'CONNECTING';
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.retries);
    this.retries += 1;
    this.clearTimer();
    this.reconnectTimer = setTimeout(() => void this.open(), delay);
  }

  private clearTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private reset(): void {
    this.state = 'DISCONNECTED';
    this.qr = null;
    this.phone = null;
    this.registered = false;
    this.retries = 0;
  }
}
