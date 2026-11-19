import express, { Router } from 'express';
import type { PaymentGateway } from '../../integrations/payments/gateway';
import type { FulfilmentService } from '../bookings/fulfilment.service';

/**
 * Razorpay webhook. Must be mounted BEFORE the JSON body parser: the signature is computed
 * over the exact raw bytes. Always answers 200 for valid-but-irrelevant events so Razorpay
 * doesn't retry them; throws (4xx/5xx) for bad signatures and processing errors.
 */
export function createWebhooksRouter(gateway: PaymentGateway, fulfilment: FulfilmentService) {
  const router = Router();

  router.post('/razorpay', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const captured = gateway.parseWebhook(body, req.get('x-razorpay-signature'));
    if (captured) {
      await fulfilment.settlePayment({
        orderId: captured.orderId,
        paymentId: captured.paymentId,
        amountPaise: captured.amountPaise,
      });
    }
    res.json({ ok: true });
  });

  return router;
}
