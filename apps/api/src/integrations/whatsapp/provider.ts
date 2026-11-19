/**
 * Anything that can deliver a WhatsApp text. Implementations: console (dev) now;
 * an unofficial-gateway adapter and the official Cloud API adapter plug in here later.
 * `send` must throw on failure so the outbox can retry.
 */
export interface WhatsAppProvider {
  readonly name: string;
  send(message: { toPhone: string; body: string }): Promise<void>;
}
