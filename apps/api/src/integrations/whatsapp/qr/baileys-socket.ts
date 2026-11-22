import makeWASocket, {
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import type { ConnectionUpdate, SocketFactory } from './types';

/**
 * Adapter from Baileys (unofficial WhatsApp Web client) to our small WaSocket interface.
 * This is the only file that touches the library, so a library change stays contained here.
 */
export const createBaileysSocket: SocketFactory = async (auth, log) => {
  const logger = log.child({ module: 'baileys' }, { level: 'warn' });
  // Ask for the current WhatsApp Web version; fall back to the library default if that lookup fails.
  const version = await fetchLatestBaileysVersion()
    .then((v) => v.version)
    .catch(() => undefined);

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: {
      creds: auth.state.creds,
      keys: makeCacheableSignalKeyStore(auth.state.keys, logger),
    },
    logger,
    browser: Browsers.ubuntu('Event Tickets'),
    markOnlineOnConnect: false, // do not steal "online" from the phone
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', () => void auth.saveCreds());

  return {
    onUpdate(listener) {
      sock.ev.on('connection.update', (u) => {
        const update: ConnectionUpdate = {};
        if (u.qr) update.qr = u.qr;
        if (u.connection === 'open') {
          update.connection = 'open';
          const id = sock.user?.id ?? '';
          update.userPhone = id.split('@')[0]?.split(':')[0] ?? '';
        }
        if (u.connection === 'close') {
          update.connection = 'close';
          const error = u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
          const code = error?.output?.statusCode;
          if (code !== undefined) update.closeCode = code;
        }
        listener(update);
      });
    },
    async resolve(phoneDigits) {
      const results = await sock.onWhatsApp(phoneDigits);
      const result = results?.[0];
      return result?.exists ? result.jid : null;
    },
    async sendText(jid, text) {
      await sock.sendMessage(jid, { text });
    },
    async logout() {
      await sock.logout();
    },
    close() {
      sock.end(undefined);
    },
  };
};
