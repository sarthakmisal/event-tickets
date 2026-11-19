import { sql } from 'kysely';
import type { Insertable, Selectable, Updateable } from 'kysely';
import type { Executor, OrganisersTable } from '../../db/schema';

export type OrganiserRow = Selectable<OrganisersTable>;
export type OrganiserWithCount = OrganiserRow & { event_count: number };

export const organisersRepository = (db: Executor) => ({
  list(): Promise<OrganiserWithCount[]> {
    return db
      .selectFrom('organisers as o')
      .selectAll('o')
      .select(
        sql<number>`(select count(*)::int from events e where e.organiser_id = o.id)`.as(
          'event_count',
        ),
      )
      .orderBy('o.created_at', 'desc')
      .execute();
  },

  findById(id: string): Promise<OrganiserRow | undefined> {
    return db.selectFrom('organisers').selectAll().where('id', '=', id).executeTakeFirst();
  },

  insert(values: Insertable<OrganisersTable>): Promise<OrganiserRow> {
    return db.insertInto('organisers').values(values).returningAll().executeTakeFirstOrThrow();
  },

  update(id: string, values: Updateable<OrganisersTable>): Promise<OrganiserRow | undefined> {
    return db
      .updateTable('organisers')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  },
});

export type OrganisersRepository = ReturnType<typeof organisersRepository>;
