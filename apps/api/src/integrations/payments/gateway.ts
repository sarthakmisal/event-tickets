import type { PaymentProviderName } from '@et/shared';

export interface CapturedPayment {
  orderId: string;
  paymentId: string;
  amountPaise: number;
}

/** What the booking module needs from any payment provider. */
export interface PaymentGateway {
  readonly name: PaymentProviderName;
  /** Public key the browser checkout needs (Razorpay key id); null when not applicable. */
  readonly publicKeyId: string | null;
  createOrder(input: { amountPaise: number; receipt: string }): Promise<{ orderId: string }>;
  /** Verifies the signature the checkout returns to the browser after payment. */
  verifyCheckout(input: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Verifies and parses a webhook; returns null for events we do not act on. Throws if unsigned. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): CapturedPayment | null;
}
