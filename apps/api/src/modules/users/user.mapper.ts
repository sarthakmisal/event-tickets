import type { UserDto } from '@et/shared';
import type { UserWithOrg } from './users.repository';

export const toUserDto = (u: UserWithOrg): UserDto => ({
  id: u.id,
  name: u.name,
  role: u.role,
  phone: u.phone,
  email: u.email,
  organiserId: u.organiser_id,
  organiserName: u.organiser_name,
  active: u.active,
});
