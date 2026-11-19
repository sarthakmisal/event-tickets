import type { CreateOrganiserInput, OrganiserDto, UpdateOrganiserInput } from '@et/shared';
import type { Db } from '../../db/schema';
import { conflict, notFound } from '../../shared/errors';
import type { AuthService } from '../auth/auth.service';
import { usersRepository } from '../users/users.repository';
import { organisersRepository } from './organisers.repository';
import type { OrganiserRow, OrganiserWithCount } from './organisers.repository';

const toDto = (o: OrganiserRow, eventCount: number): OrganiserDto => ({
  id: o.id,
  name: o.name,
  phone: o.phone,
  email: o.email,
  commissionBps: o.commission_bps,
  active: o.active,
  eventCount,
  createdAt: o.created_at.toISOString(),
});

const fromRow = (o: OrganiserWithCount) => toDto(o, o.event_count);

/** Owner-only: appoint organisers and set their commission. */
export function createOrganisersService(db: Db, auth: AuthService) {
  return {
    async list(): Promise<OrganiserDto[]> {
      return (await organisersRepository(db).list()).map(fromRow);
    },

    async create(input: CreateOrganiserInput): Promise<OrganiserDto> {
      const passwordHash = await auth.hashPassword(input.password);
      return db.transaction().execute(async (trx) => {
        if (await usersRepository(trx).existsByPhoneOrEmail(input.phone, input.email)) {
          throw conflict('A user with this phone or email already exists', 'phone');
        }
        const organiser = await organisersRepository(trx).insert({
          name: input.name,
          phone: input.phone,
          email: input.email,
          commission_bps: input.commissionBps,
        });
        await usersRepository(trx).insert({
          name: input.name,
          phone: input.phone,
          email: input.email,
          password_hash: passwordHash,
          role: 'ORGANISER',
          organiser_id: organiser.id,
        });
        return toDto(organiser, 0);
      });
    },

    /** Commission changes apply to events created afterwards; existing events keep their snapshot. */
    async update(id: string, input: UpdateOrganiserInput): Promise<OrganiserDto> {
      const values = {
        ...(input.commissionBps !== undefined && { commission_bps: input.commissionBps }),
        ...(input.active !== undefined && { active: input.active }),
      };
      const row = Object.keys(values).length
        ? await organisersRepository(db).update(id, values)
        : await organisersRepository(db).findById(id);
      if (!row) throw notFound('Organiser');
      const withCount = (await organisersRepository(db).list()).find((o) => o.id === id);
      return toDto(row, withCount?.event_count ?? 0);
    },
  };
}

export type OrganisersService = ReturnType<typeof createOrganisersService>;
