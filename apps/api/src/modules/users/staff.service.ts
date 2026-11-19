import type { CreateStaffInput, UserDto } from '@et/shared';
import { conflict, forbidden, notFound } from '../../shared/errors';
import type { Actor } from '../auth/actor';
import type { AuthService } from '../auth/auth.service';
import { toUserDto } from './user.mapper';
import type { UsersRepository } from './users.repository';

/** Gate staff management. Organisers manage their own staff; the owner manages all. */
export function createStaffService(users: UsersRepository, auth: AuthService) {
  async function ownedStaff(actor: Actor, id: string) {
    const user = await users.findById(id);
    if (!user || user.role !== 'GATE_STAFF') throw notFound('Staff member');
    if (actor.role !== 'OWNER' && user.organiser_id !== actor.organiserId) throw forbidden();
    return user;
  }

  return {
    async list(actor: Actor): Promise<UserDto[]> {
      const scope = actor.role === 'OWNER' ? null : actor.organiserId;
      return (await users.listGateStaff(scope)).map(toUserDto);
    },

    async create(actor: Actor, input: CreateStaffInput): Promise<UserDto> {
      if (await users.existsByPhoneOrEmail(input.phone, input.email)) {
        throw conflict('A user with this phone or email already exists', 'phone');
      }
      const row = await users.insert({
        name: input.name,
        phone: input.phone,
        email: input.email,
        password_hash: await auth.hashPassword(input.password),
        role: 'GATE_STAFF',
        organiser_id: actor.organiserId,
      });
      return toUserDto(
        (await users.findById(row.id)) ?? { ...row, organiser_name: null, organiser_active: null },
      );
    },

    async setActive(actor: Actor, id: string, active: boolean): Promise<UserDto> {
      const user = await ownedStaff(actor, id);
      await users.update(user.id, { active });
      return toUserDto({ ...user, active });
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;
