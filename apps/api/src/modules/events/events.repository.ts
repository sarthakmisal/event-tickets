import { sql } from 'kysely';
import type { Insertable, Selectable, Updateable } from 'kysely';
import type { EventStatus } from '@et/shared';
import type { EventsTable, Executor } from '../../db/schema';

export type EventRow = Selectable<EventsTable>;
export type EventWithCounts = EventRow & {
  organiser_name: string;
  sold: number;
  held: number;
  inside: number;
};

const withCounts = (db: Executor, now: Date) =>
  db
    .selectFrom('events as e')
    .innerJoin('organisers as o', 'o.id', 'e.organiser_id')
    .selectAll('e')
    .select([
      'o.name as organiser_name',
      sql<number>`coalesce((select sum(b.quantity) from bookings b where b.event_id = e.id and b.status = 'PAID'), 0)::int`.as(
        'sold',
      ),
      sql<number>`coalesce((select sum(b.quantity) from bookings b where b.event_id = e.id and b.status = 'PENDING' and b.hold_expires_at > ${now}), 0)::int`.as(
        'held',
      ),
      sql<number>`(select count(*) from tickets t where t.event_id = e.id and t.state = 'INSIDE')::int`.as(
        'inside',
      ),
    ]);

export interface EventFilter {
  organiserId: string | null;
  statuses?: EventStatus[];
}

export const eventsRepository = (db: Executor) => ({
  list(filter: EventFilter, now: Date): Promise<EventWithCounts[]> {
    let query = withCounts(db, now).orderBy('e.starts_at', 'desc');
    if (filter.organiserId) query = query.where('e.organiser_id', '=', filter.organiserId);
    if (filter.statuses) query = query.where('e.status', 'in', filter.statuses);
    return query.execute();
  },

  findWithCounts(id: string, now: Date): Promise<EventWithCounts | undefined> {
    return withCounts(db, now).where('e.id', '=', id).executeTakeFirst();
  },

  findById(id: string): Promise<EventRow | undefined> {
    return db.selectFrom('events').selectAll().where('id', '=', id).executeTakeFirst();
  },

  /** Row-locks the event; serialises concurrent bookings so seats are never oversold. */
  lockById(id: string): Promise<EventRow | undefined> {
    return db.selectFrom('events').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  },

  insert(values: Insertable<EventsTable>): Promise<EventRow> {
    return db.insertInto('events').values(values).returningAll().executeTakeFirstOrThrow();
  },

  update(id: string, values: Updateable<EventsTable>): Promise<void> {
    return db
      .updateTable('events')
      .set({ ...values, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
      .then(() => undefined);
  },
});

export type EventsRepository = ReturnType<typeof eventsRepository>;
