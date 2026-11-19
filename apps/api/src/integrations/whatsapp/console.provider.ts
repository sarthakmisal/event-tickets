import type { Logger } from '../../shared/logger';
import type { WhatsAppProvider } from './provider';

export function createConsoleProvider(log: Logger): WhatsAppProvider {
  return {
    name: 'console',
    async send({ toPhone, body }) {
      log.info({ toPhone, body }, 'whatsapp (console provider) — not actually sent');
    },
  };
}
