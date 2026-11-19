import type { WhatsAppProvider } from './provider';

export type CloudApiConfig = {
  token: string;
  phoneNumberId: string;
  /** Prepended to 10-digit Indian numbers, e.g. "91". */
  countryCode: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
};

/** Official WhatsApp Business Cloud API (Meta). Plain-text messages. */
export function createCloudApiProvider(config: CloudApiConfig): WhatsAppProvider {
  const { token, phoneNumberId, countryCode, apiVersion = 'v21.0', fetchImpl = fetch } = config;
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const toE164 = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 ? `${countryCode}${digits}` : digits;
  };

  return {
    name: 'cloud-api',
    async send({ toPhone, body }) {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toE164(toPhone),
          type: 'text',
          text: { body, preview_url: true },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(`WhatsApp ${res.status}: ${data?.error?.message ?? res.statusText}`);
      }
    },
  };
}
