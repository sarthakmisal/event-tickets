import type { WhatsAppStatusDto } from '@et/shared';
import type { QrWhatsApp } from '../../integrations/whatsapp/qr/manager';
import { PLATFORM_KEY } from '../../integrations/whatsapp/qr/manager';
import { WhatsAppUnavailableError } from '../../integrations/whatsapp/provider';
import { badRequest, conflict } from '../../shared/errors';
import type { Actor } from '../auth/actor';
import { organiserScope } from '../auth/actor';

const TEST_MESSAGE = 'Test message from Event Tickets. Your WhatsApp number is connected ✅';

/**
 * Lets the owner link the platform's number and each organiser link their own by scanning a QR.
 * Only available when WHATSAPP_PROVIDER=qr; otherwise the panel hides the card.
 */
export function createWhatsAppService(qr: QrWhatsApp | null) {
  const keyOf = (actor: Actor) => organiserScope(actor) ?? PLATFORM_KEY;

  const status = (actor: Actor): WhatsAppStatusDto => {
    if (!qr) {
      return {
        supported: false,
        scope: 'PLATFORM',
        state: 'DISCONNECTED',
        qr: null,
        phone: null,
        error: null,
        fallbackConnected: false,
      };
    }
    const key = keyOf(actor);
    const snap = qr.snapshot(key);
    return {
      supported: true,
      scope: key === PLATFORM_KEY ? 'PLATFORM' : 'ORGANISER',
      state: snap.state,
      qr: snap.qr,
      phone: snap.phone,
      error: snap.error,
      fallbackConnected: key !== PLATFORM_KEY && qr.platformConnected(),
    };
  };

  const enabled = () => {
    if (!qr) throw conflict('QR WhatsApp is not enabled on this server (set WHATSAPP_PROVIDER=qr)');
    return qr;
  };

  return {
    status,

    async connect(actor: Actor): Promise<WhatsAppStatusDto> {
      await enabled().connect(keyOf(actor));
      return status(actor);
    },

    async disconnect(actor: Actor): Promise<WhatsAppStatusDto> {
      await enabled().disconnect(keyOf(actor));
      return status(actor);
    },

    async sendTest(actor: Actor, phone: string): Promise<void> {
      const manager = enabled();
      const key = keyOf(actor);
      if (manager.snapshot(key).state !== 'CONNECTED')
        throw conflict('Connect your WhatsApp number first');
      try {
        await manager.sendVia(key, phone, TEST_MESSAGE);
      } catch (err) {
        if (err instanceof WhatsAppUnavailableError) throw conflict(err.message);
        throw badRequest(err instanceof Error ? err.message : 'Could not send the test message');
      }
    },
  };
}

export type WhatsAppService = ReturnType<typeof createWhatsAppService>;
