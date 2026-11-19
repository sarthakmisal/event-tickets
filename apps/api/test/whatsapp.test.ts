import { describe, expect, it, vi } from 'vitest';
import { createCloudApiProvider } from '../src/integrations/whatsapp/cloud-api.provider';
import { loadEnv } from '../src/config/env';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/x',
  APP_SECRET: 'a'.repeat(32),
};

describe('cloud-api provider', () => {
  it('prefixes the country code and posts a text message', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const p = createCloudApiProvider({
      token: 't',
      phoneNumberId: '123',
      countryCode: '91',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await p.send({ toPhone: '9876543210', body: 'hi' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/123/messages');
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: '919876543210',
      text: { body: 'hi' },
    });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
  });

  it('throws with the API error so the outbox retries', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'bad token' } }), { status: 401 }),
    );
    const p = createCloudApiProvider({
      token: 't',
      phoneNumberId: '1',
      countryCode: '91',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(p.send({ toPhone: '9876543210', body: 'x' })).rejects.toThrow('401: bad token');
  });

  it('requires credentials when enabled', () => {
    expect(() => loadEnv({ ...base, WHATSAPP_PROVIDER: 'cloud-api' })).toThrow('WHATSAPP_TOKEN');
  });
});
