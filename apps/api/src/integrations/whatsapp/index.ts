import type { Env } from '../../config/env';
import type { Logger } from '../../shared/logger';
import { createCloudApiProvider } from './cloud-api.provider';
import { createConsoleProvider } from './console.provider';
import type { WhatsAppProvider } from './provider';

/** Console and official Cloud API senders. The QR sender needs the database, so app.ts builds it. */
export function createWhatsAppProvider(env: Env, log: Logger): WhatsAppProvider {
  if (env.WHATSAPP_PROVIDER === 'cloud-api') {
    return createCloudApiProvider({
      token: env.WHATSAPP_TOKEN ?? '',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
      countryCode: env.WHATSAPP_COUNTRY_CODE,
    });
  }
  return createConsoleProvider(log);
}
