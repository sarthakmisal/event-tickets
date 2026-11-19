import type { ConfirmPaymentInput, PaymentIntentDto } from '@et/shared';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: 'INR';
  name: string;
  prefill: { name: string; contact: string };
  handler: (r: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}
type RazorpayCtor = new (options: RazorpayOptions) => { open(): void };

let loading: Promise<RazorpayCtor> | null = null;

function loadRazorpay(): Promise<RazorpayCtor> {
  const existing = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve((window as unknown as { Razorpay: RazorpayCtor }).Razorpay);
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment window. Check your connection.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Opens Razorpay Checkout; resolves with the signed result, or null if the customer closed it. */
export async function payWithRazorpay(
  intent: PaymentIntentDto,
  customer: { name: string; phone: string },
): Promise<ConfirmPaymentInput | null> {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve) => {
    new Razorpay({
      key: intent.keyId ?? '',
      order_id: intent.orderId,
      amount: intent.amountPaise,
      currency: 'INR',
      name: 'Event Tickets',
      prefill: { name: customer.name, contact: customer.phone },
      handler: (r) =>
        resolve({
          providerOrderId: r.razorpay_order_id,
          providerPaymentId: r.razorpay_payment_id,
          signature: r.razorpay_signature,
        }),
      modal: { ondismiss: () => resolve(null) },
    }).open();
  });
}
