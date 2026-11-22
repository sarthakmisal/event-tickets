import { sql } from 'kysely';
import type { Insertable, Selectable } from 'kysely';
import type { Executor, MessagesTable } from '../../db/schema';

export type MessageRow = Selectable<MessagesTable>;

const STUCK_AFTER_MS = 5 * 60_000;

export const messagesRepository = (db: Executor) => ({
  /** Idempotent per (booking, template): a re-confirmed booking never sends twice. */
  async enqueue(values: Insertable<MessagesTable>): Promise<void> {
    await db
      .insertInto('messages')
      .values(values)
      .onConflict((oc) =>
        oc.columns(['booking_id', 'template']).where('booking_id', 'is not', null).doNothing(),
      )
      .execute();
  },

  /** Atomically claims due messages; SKIP LOCKED lets several workers run safely. */
  claimDue(now: Date, limit: number): Promise<MessageRow[]> {
    const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);
    return db
      .updateTable('messages')
      .set({ status: 'SENDING', locked_at: now })
      .where('id', 'in', (qb) =>
        qb
          .selectFrom('messages')
          .select('id')
          .where((eb) =>
            eb.or([
              eb.and([eb('status', '=', 'QUEUED'), eb('next_attempt_at', '<=', now)]),
              eb.and([eb('status', '=', 'SENDING'), eb('locked_at', '<', stuckBefore)]),
            ]),
          )
          .orderBy('next_attempt_at')
          .limit(limit)
          .forUpdate()
          .skipLocked(),
      )
      .returningAll()
      .execute();
  },

  /** The organiser a message belongs to (via its booking's event), or undefined for platform messages. */
  async organiserIdOf(bookingId: string | null): Promise<string | undefined> {
    if (!bookingId) return undefined;
    const row = await db
      .selectFrom('bookings as b')
      .innerJoin('events as e', 'e.id', 'b.event_id')
      .select('e.organiser_id')
      .where('b.id', '=', bookingId)
      .executeTakeFirst();
    return row?.organiser_id;
  },

  async markSent(id: string, now: Date): Promise<void> {
    await db
      .updateTable('messages')
      .set({ status: 'SENT', sent_at: now, locked_at: null, last_error: null })
      .where('id', '=', id)
      .execute();
  },

  async markAttemptFailed(
    id: string,
    patch: { attempts: number; status: 'QUEUED' | 'FAILED'; nextAttemptAt: Date; error: string },
  ): Promise<void> {
    await db
      .updateTable('messages')
      .set({
        status: patch.status,
        attempts: patch.attempts,
        next_attempt_at: patch.nextAttemptAt,
        last_error: patch.error.slice(0, 500),
        locked_at: null,
      })
      .where('id', '=', id)
      .execute();
  },

  /** Puts a FAILED message back in the queue (manual resend). Returns false if not resendable. */
  async requeue(id: string, now: Date): Promise<boolean> {
    const result = await db
      .updateTable('messages')
      .set({ status: 'QUEUED', attempts: 0, next_attempt_at: now, last_error: null })
      .where('id', '=', id)
      .where('status', 'in', ['FAILED', 'SENT'])
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  },

  findScoped(id: string, organiserId: string | null): Promise<MessageRow | undefined> {
    let query = db
      .selectFrom('messages as m')
      .leftJoin('bookings as b', 'b.id', 'm.booking_id')
      .leftJoin('events as e', 'e.id', 'b.event_id')
      .selectAll('m')
      .where('m.id', '=', id);
    if (organiserId) query = query.where('e.organiser_id', '=', organiserId);
    return query.executeTakeFirst();
  },

  list(organiserId: string | null, limit: number): Promise<MessageRow[]> {
    let query = db
      .selectFrom('messages as m')
      .leftJoin('bookings as b', 'b.id', 'm.booking_id')
      .leftJoin('events as e', 'e.id', 'b.event_id')
      .selectAll('m')
      .orderBy('m.created_at', 'desc')
      .limit(limit);
    if (organiserId) query = query.where('e.organiser_id', '=', organiserId);
    return query.execute();
  },

  async countUndelivered(organiserId: string | null): Promise<number> {
    let query = db
      .selectFrom('messages as m')
      .leftJoin('bookings as b', 'b.id', 'm.booking_id')
      .leftJoin('events as e', 'e.id', 'b.event_id')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('m.status', '!=', 'SENT');
    if (organiserId) query = query.where('e.organiser_id', '=', organiserId);
    return (await query.executeTakeFirstOrThrow()).n;
  },
});

export type MessagesRepository = ReturnType<typeof messagesRepository>;
