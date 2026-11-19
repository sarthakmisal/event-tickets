import { sql } from 'kysely';
import type { Insertable, Selectable, Updateable } from 'kysely';
import type { BookingsTable, Executor } from '../../db/schema';

export type BookingRow = Selectable<BookingsTable>;
export type BookingWithEvent = BookingRow & { event_title: string; organiser_id: string };

const withEvent = (db: Executor) =>
  db
    .selectFrom('bookings as b')
    .innerJoin('events as e', 'e.id', 'b.event_id')
    .selectAll('b')
    .select(['e.title as event_title', 'e.organiser_id as organiser_id']);

export interface BookingFilter {
  organiserId: string | null;
  eventId?: string;
  limit: number;
}

export const bookingsRepository = (db: Executor) => ({
  insert(values: Insertable<BookingsTable>): Promise<BookingRow> {
    return db.insertInto('bookings').values(values).returningAll().executeTakeFirstOrThrow();
  },

  update(id: string, values: Updateable<BookingsTable>): Promise<void> {
    return db
      .updateTable('bookings')
      .set(values)
      .where('id', '=', id)
      .execute()
      .then(() => undefined);
  },

  findById(id: string): Promise<BookingWithEvent | undefined> {
    return withEvent(db).where('b.id', '=', id).executeTakeFirst();
  },

  /** Row-locks the booking for the rest of the transaction. */
  lockById(id: string): Promise<BookingRow | undefined> {
    return db
      .selectFrom('bookings')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  },

  list(filter: BookingFilter): Promise<BookingWithEvent[]> {
    let query = withEvent(db).orderBy('b.created_at', 'desc').limit(filter.limit);
    if (filter.organiserId) query = query.where('e.organiser_id', '=', filter.organiserId);
    if (filter.eventId) query = query.where('b.event_id', '=', filter.eventId);
    return query.execute();
  },

  /** Seats taken by paid bookings and by pending bookings whose hold is still running. */
  async occupancy(eventId: string, now: Date): Promise<{ sold: number; held: number }> {
    const row = await db
      .selectFrom('bookings')
      .select([
        sql<number>`coalesce(sum(quantity) filter (where status = 'PAID'), 0)::int`.as('sold'),
        sql<number>`coalesce(sum(quantity) filter (where status = 'PENDING' and hold_expires_at > ${now}), 0)::int`.as(
          'held',
        ),
      ])
      .where('event_id', '=', eventId)
      .executeTakeFirstOrThrow();
    return row;
  },

  async expireStaleHolds(now: Date): Promise<number> {
    const result = await db
      .updateTable('bookings')
      .set({ status: 'EXPIRED' })
      .where('status', '=', 'PENDING')
      .where('hold_expires_at', '<=', now)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  },

  /** Event cancelled: refund-flag paid bookings, drop pending ones. */
  async cancelForEvent(eventId: string): Promise<void> {
    await db
      .updateTable('bookings')
      .set({ needs_refund: true })
      .where('event_id', '=', eventId)
      .where('status', '=', 'PAID')
      .execute();
    await db
      .updateTable('bookings')
      .set({ status: 'CANCELLED', hold_expires_at: null })
      .where('event_id', '=', eventId)
      .where('status', '=', 'PENDING')
      .execute();
  },
});

export type BookingsRepository = ReturnType<typeof bookingsRepository>;
