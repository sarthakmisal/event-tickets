import type {
  ConnectionUpdate,
  SocketFactory,
  WaSocket,
} from '../src/integrations/whatsapp/qr/types';

/** A WhatsApp client that never touches the network; tests drive it by calling emit(). */
export class FakeSocket implements WaSocket {
  sent: { jid: string; text: string }[] = [];
  onWhatsApp = true;
  loggedOut = false;
  closed = false;
  private listener: ((update: ConnectionUpdate) => void) | null = null;

  onUpdate(listener: (update: ConnectionUpdate) => void): void {
    this.listener = listener;
  }
  emit(update: ConnectionUpdate): void {
    this.listener?.(update);
  }
  async resolve(phoneDigits: string): Promise<string | null> {
    return this.onWhatsApp ? `${phoneDigits}@s.whatsapp.net` : null;
  }
  async sendText(jid: string, text: string): Promise<void> {
    this.sent.push({ jid, text });
  }
  async logout(): Promise<void> {
    this.loggedOut = true;
  }
  close(): void {
    this.closed = true;
  }
}

/** Factory that records every socket it creates, in order. */
export function fakeSocketFactory() {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = async () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  };
  return { factory, sockets };
}

export const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
