/**
 * Anything that can deliver a WhatsApp text. Implementations: console (dev), the linked-device
 * QR sender and the official Cloud API sender. `send` must throw on failure so the outbox retries.
 */
export interface WhatsAppProvider {
  readonly name: string;
  /** `senderKey` is the organiser the message belongs to; providers with per-organiser numbers use it. */
  send(message: { toPhone: string; body: string; senderKey?: string }): Promise<void>;
}

/**
 * The provider cannot send right now for a reason that is not the message's fault
 * (number not linked, daily limit reached). The outbox keeps the message queued and does not
 * count the attempt, so nothing is lost while the number is disconnected.
 */
export class WhatsAppUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsAppUnavailableError';
  }
}
