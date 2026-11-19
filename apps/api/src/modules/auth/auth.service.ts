import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { phoneSchema } from '@et/shared';
import type { UserDto } from '@et/shared';
import { badRequest, forbidden, unauthenticated } from '../../shared/errors';
import { toUserDto } from '../users/user.mapper';
import type { UsersRepository, UserWithOrg } from '../users/users.repository';
import type { Actor } from './actor';

export const SESSION_HOURS = 12;

const tokenPayload = z.object({ sub: z.string().uuid(), pv: z.number().int() });

interface AuthConfig {
  secret: string;
  bcryptCost: number;
}

export function createAuthService(users: UsersRepository, config: AuthConfig) {
  // Compared against when the user does not exist, so response time doesn't reveal valid logins.
  const dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptCost);

  const isUsable = (u: UserWithOrg) => u.active && u.organiser_active !== false;
  const toActor = (u: UserWithOrg): Actor => ({
    id: u.id,
    name: u.name,
    role: u.role,
    organiserId: u.organiser_id,
  });

  function lookupKey(login: string) {
    if (login.includes('@')) return { email: login.trim().toLowerCase() };
    const phone = phoneSchema.safeParse(login);
    return phone.success ? { phone: phone.data } : null;
  }

  return {
    hashPassword: (plain: string) => bcrypt.hash(plain, config.bcryptCost),

    async login(login: string, password: string): Promise<{ token: string; user: UserDto }> {
      const key = lookupKey(login);
      const user = key ? await users.findByEmailOrPhone(key) : undefined;
      const valid = await bcrypt.compare(password, user?.password_hash ?? dummyHash);
      if (!user || !valid) throw unauthenticated('Wrong login or password');
      if (!isUsable(user)) throw forbidden('This account is disabled');
      const token = jwt.sign({ pv: user.pw_version }, config.secret, {
        algorithm: 'HS256',
        subject: user.id,
        expiresIn: `${SESSION_HOURS}h`,
      });
      return { token, user: toUserDto(user) };
    },

    /** Validates a session token against the current database state. */
    async authenticate(token: string | undefined): Promise<Actor> {
      if (!token) throw unauthenticated();
      let payload: z.infer<typeof tokenPayload>;
      try {
        payload = tokenPayload.parse(jwt.verify(token, config.secret, { algorithms: ['HS256'] }));
      } catch {
        throw unauthenticated('Session expired, please sign in again');
      }
      const user = await users.findById(payload.sub);
      if (!user || !isUsable(user) || user.pw_version !== payload.pv) {
        throw unauthenticated('Session expired, please sign in again');
      }
      return toActor(user);
    },

    async me(actor: Actor): Promise<UserDto> {
      const user = await users.findById(actor.id);
      if (!user) throw unauthenticated();
      return toUserDto(user);
    },

    async changePassword(actor: Actor, current: string, next: string): Promise<void> {
      const user = await users.findById(actor.id);
      if (!user || !(await bcrypt.compare(current, user.password_hash))) {
        throw badRequest('Current password is wrong', 'currentPassword');
      }
      await users.update(user.id, {
        password_hash: await bcrypt.hash(next, config.bcryptCost),
        pw_version: user.pw_version + 1,
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
