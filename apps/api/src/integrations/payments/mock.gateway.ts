import { hmacSha256Hex, randomToken, safeEqual } from '../../shared/crypto';
import type { PaymentGateway } from './gateway';

/**
 * Development/test gateway. Uses the same signature scheme as Razorpay
 * (HMAC-SHA256 of "orderId|paymentId") so the confirm flow is exercised for real.
 */
export function createMockGateway(secret: string): PaymentGateway & {
  simulatePayment(orderId: string): {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  };
} {
  const sign = (orderId: string, paymentId: string) =>
    hmacSha256Hex(secret, `${orderId}|${paymentId}`);
  return {
    name: 'mock',
    publicKeyId: null,
    async createOrder() {
      return { orderId: `order_mock_${randomToken(9)}` };
    },
    verifyCheckout: ({ orderId, paymentId, signature }) =>
      safeEqual(sign(orderId, paymentId), signature),
    parseWebhook: () => null,
    simulatePayment(orderId) {
      const paymentId = `pay_mock_${randomToken(9)}`;
      return {
        providerOrderId: orderId,
        providerPaymentId: paymentId,
        signature: sign(orderId, paymentId),
      };
    },
  };
}
