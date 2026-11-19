import type { Insertable, Selectable, Updateable } from 'kysely';
import type { Executor, UsersTable } from '../../db/schema';

export type UserRow = Selectable<UsersTable>;
export type UserWithOrg = UserRow & {
  organiser_name: string | null;
  organiser_active: boolean | null;
};

const withOrg = (db: Executor) =>
  db
    .selectFrom('users as u')
    .leftJoin('organisers as o', 'o.id', 'u.organiser_id')
    .selectAll('u')
    .select(['o.name as organiser_name', 'o.active as organiser_active']);

export const usersRepository = (db: Executor) => ({
  findById(id: string): Promise<UserWithOrg | undefined> {
    return withOrg(db).where('u.id', '=', id).executeTakeFirst();
  },

  findByEmailOrPhone(key: { email: string } | { phone: string }): Promise<UserWithOrg | undefined> {
    const query = withOrg(db);
    return (
      'email' in key
        ? query.where((eb) => eb(eb.fn('lower', ['u.email']), '=', key.email))
        : query.where('u.phone', '=', key.phone)
    ).executeTakeFirst();
  },

  existsByPhoneOrEmail(phone: string, email: string | null): Promise<boolean> {
    return db
      .selectFrom('users')
      .select('id')
      .where((eb) =>
        email
          ? eb.or([
              eb('phone', '=', phone),
              eb(eb.fn('lower', ['email']), '=', email.toLowerCase()),
            ])
          : eb('phone', '=', phone),
      )
      .executeTakeFirst()
      .then(Boolean);
  },

  insert(values: Insertable<UsersTable>): Promise<UserRow> {
    return db.insertInto('users').values(values).returningAll().executeTakeFirstOrThrow();
  },

  update(id: string, values: Updateable<UsersTable>): Promise<void> {
    return db
      .updateTable('users')
      .set(values)
      .where('id', '=', id)
      .execute()
      .then(() => undefined);
  },

  listGateStaff(organiserId: string | null): Promise<UserWithOrg[]> {
    let query = withOrg(db).where('u.role', '=', 'GATE_STAFF').orderBy('u.created_at', 'desc');
    if (organiserId) query = query.where('u.organiser_id', '=', organiserId);
    return query.execute();
  },
});

export type UsersRepository = ReturnType<typeof usersRepository>;
