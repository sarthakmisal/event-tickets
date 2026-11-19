import { loadEnv } from '../config/env';
import { createWhatsAppProvider } from '../integrations/whatsapp';
import { createLogger } from '../shared/logger';

// CLI: `npm run wa:test -- 9876543210` — sends one test message through the configured provider.
const to = process.argv[2];
if (!to) {
  console.error('Usage: npm run wa:test -- <10-digit phone>');
  process.exit(1);
}
const env = loadEnv();
const provider = createWhatsAppProvider(env, createLogger('info'));
try {
  await provider.send({
    toPhone: to,
    body: 'Test message from Event Tickets. WhatsApp integration is working ✅',
  });
  console.log(`Sent via "${provider.name}" to ${to}`);
} catch (err) {
  console.error(`Failed via "${provider.name}":`, err instanceof Error ? err.message : err);
  process.exit(1);
}
