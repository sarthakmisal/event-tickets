import type { Selectable } from 'kysely';
import { generateTicketCode } from '@et/shared';
import type { TicketState } from '@et/shared';
import type { Executor, TicketsTable } from '../../db/schema';
import { randomIntBelow } from '../../shared/crypto';

export type TicketRow = Selectable<TicketsTable>;
export type TicketWithEvent = TicketRow & {
  event_title: string;
  event_status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  event_venue: string;
  event_starts_at: Date;
  organiser_id: string;
};

const CODE_RETRIES = 5;

export const ticketsRepository = (db: Executor) => ({
  /** Inserts one ticket per attendee, retrying on the (very unlikely) code collision. */
  async issue(bookingId: string, eventId: string, attendeeNames: string[]): Promise<TicketRow[]> {
    const issued: TicketRow[] = [];
    for (const attendeeName of attendeeNames) {
      let row: TicketRow | undefined;
      for (let attempt = 0; attempt < CODE_RETRIES && !row; attempt += 1) {
        row = await db
          .insertInto('tickets')
          .values({
            booking_id: bookingId,
            event_id: eventId,
            attendee_name: attendeeName,
            code: generateTicketCode(randomIntBelow),
          })
          .onConflict((oc) => oc.column('code').doNothing())
          .returningAll()
          .executeTakeFirst();
      }
      if (!row) throw new Error('Could not allocate a unique ticket code');
      issued.push(row);
    }
    return issued;
  },

  listByBookingIds(bookingIds: string[]): Promise<TicketRow[]> {
    if (bookingIds.length === 0) return Promise.resolve([]);
    return db
      .selectFrom('tickets')
      .selectAll()
      .where('booking_id', 'in', bookingIds)
      .orderBy('created_at')
      .orderBy('code')
      .execute();
  },

  findByCode(code: string): Promise<TicketWithEvent | undefined> {
    return db
      .selectFrom('tickets as t')
      .innerJoin('events as e', 'e.id', 't.event_id')
      .selectAll('t')
      .select([
        'e.title as event_title',
        'e.status as event_status',
        'e.venue as event_venue',
        'e.starts_at as event_starts_at',
        'e.organiser_id as organiser_id',
      ])
      .where('t.code', '=', code)
      .executeTakeFirst();
  },

  /** Atomic compare-and-set: only applies if the ticket is still in one of `from` states. */
  async transition(id: string, from: TicketState[], to: TicketState): Promise<boolean> {
    const result = await db
      .updateTable('tickets')
      .set({ state: to, updated_at: new Date() })
      .where('id', '=', id)
      .where('state', 'in', from)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  },

  async currentState(id: string): Promise<TicketState | undefined> {
    const row = await db
      .selectFrom('tickets')
      .select('state')
      .where('id', '=', id)
      .executeTakeFirst();
    return row?.state;
  },

  async voidForEvent(eventId: string): Promise<void> {
    await db
      .updateTable('tickets')
      .set({ state: 'VOID', updated_at: new Date() })
      .where('event_id', '=', eventId)
      .execute();
  },

  async countInside(eventId: string): Promise<number> {
    const row = await db
      .selectFrom('tickets')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('event_id', '=', eventId)
      .where('state', '=', 'INSIDE')
      .executeTakeFirstOrThrow();
    return Number(row.n);
  },
});

export type TicketsRepository = ReturnType<typeof ticketsRepository>;
