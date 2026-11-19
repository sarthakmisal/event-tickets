import { z } from 'zod';
import { AppError } from '../../shared/errors';
import { hmacSha256Hex, safeEqual } from '../../shared/crypto';
import type { CapturedPayment, PaymentGateway } from './gateway';

interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

const orderResponse = z.object({ id: z.string() });

const webhookPayload = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z.object({
        entity: z.object({ id: z.string(), order_id: z.string().nullable(), amount: z.number() }),
      }),
    })
    .partial()
    .optional(),
});

/** Razorpay Orders API + Checkout signature + webhook verification (REST, no SDK). */
export function createRazorpayGateway(config: RazorpayConfig): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;

  return {
    name: 'razorpay',
    publicKeyId: config.keyId,

    async createOrder({ amountPaise, receipt }) {
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!res?.ok)
        throw new AppError(502, 'UPSTREAM', 'Payment provider is unavailable, try again');
      return { orderId: orderResponse.parse(await res.json()).id };
    },

    verifyCheckout: ({ orderId, paymentId, signature }) =>
      safeEqual(hmacSha256Hex(config.keySecret, `${orderId}|${paymentId}`), signature),

    parseWebhook(rawBody, signature): CapturedPayment | null {
      if (!signature || !safeEqual(hmacSha256Hex(config.webhookSecret, rawBody), signature)) {
        throw new AppError(400, 'VALIDATION', 'Invalid webhook signature');
      }
      const parsed = webhookPayload.safeParse(JSON.parse(rawBody.toString('utf8')));
      if (!parsed.success || parsed.data.event !== 'payment.captured') return null;
      const entity = parsed.data.payload?.payment?.entity;
      if (!entity?.order_id) return null;
      return { orderId: entity.order_id, paymentId: entity.id, amountPaise: entity.amount };
    },
  };
}
