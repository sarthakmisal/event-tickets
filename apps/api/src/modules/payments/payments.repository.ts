import type { Insertable, Selectable } from 'kysely';
import type { Executor, PaymentsTable } from '../../db/schema';

export type PaymentRow = Selectable<PaymentsTable>;

export const paymentsRepository = (db: Executor) => ({
  insert(values: Insertable<PaymentsTable>): Promise<PaymentRow> {
    return db.insertInto('payments').values(values).returningAll().executeTakeFirstOrThrow();
  },

  findByOrderId(orderId: string): Promise<PaymentRow | undefined> {
    return db
      .selectFrom('payments')
      .selectAll()
      .where('provider_order_id', '=', orderId)
      .executeTakeFirst();
  },

  lockByOrderId(orderId: string): Promise<PaymentRow | undefined> {
    return db
      .selectFrom('payments')
      .selectAll()
      .where('provider_order_id', '=', orderId)
      .forUpdate()
      .executeTakeFirst();
  },

  async markCaptured(id: string, providerPaymentId: string): Promise<void> {
    await db
      .updateTable('payments')
      .set({ status: 'CAPTURED', provider_payment_id: providerPaymentId })
      .where('id', '=', id)
      .execute();
  },
});

export type PaymentsRepository = ReturnType<typeof paymentsRepository>;
