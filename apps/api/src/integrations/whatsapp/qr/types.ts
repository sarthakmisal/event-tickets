import type { AuthenticationState } from '@whiskeysockets/baileys';
import type { Logger } from '../../../shared/logger';

export type WaState = 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED';

export interface ConnectionUpdate {
  /** A fresh pairing QR (raw string, rendered by the web panel). */
  qr?: string;
  connection?: 'open' | 'close';
  /** Disconnect status code when connection === 'close' (401 = logged out from the phone). */
  closeCode?: number;
  /** Own number (digits, with country code) once connected. */
  userPhone?: string;
}

/** The small surface of a WhatsApp client the session needs. Real: Baileys. Tests: a fake. */
export interface WaSocket {
  onUpdate(listener: (update: ConnectionUpdate) => void): void;
  /** Resolves the chat id for a number, or null when the number is not on WhatsApp. */
  resolve(phoneDigits: string): Promise<string | null>;
  sendText(jid: string, text: string): Promise<void>;
  logout(): Promise<void>;
  close(): void;
}

export interface AuthHandle {
  state: AuthenticationState;
  saveCreds(): Promise<void>;
}

export type SocketFactory = (auth: AuthHandle, log: Logger) => Promise<WaSocket>;

export interface SessionSnapshot {
  state: WaState;
  qr: string | null;
  phone: string | null;
  /** Why the last connection attempt ended, for the panel to show. */
  error: string | null;
}
