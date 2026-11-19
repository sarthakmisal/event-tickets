import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { rupeesToPaise, splitCommission } from '@et/shared';
import { loadEnv } from '../config/env';
import { bookingsRepository } from '../modules/bookings/bookings.repository';
import { eventsRepository } from '../modules/events/events.repository';
import { organisersRepository } from '../modules/organisers/organisers.repository';
import { ticketsRepository } from '../modules/tickets/tickets.repository';
import { usersRepository } from '../modules/users/users.repository';
import { randomToken } from '../shared/crypto';
import { createDb } from './client';
import { migrateToLatest } from './migrate';
import type { Db } from './schema';

const OWNER_PHONE = '7498605559';
const DAY = 86_400_000;

/**
 * Minimal, idempotent starter data: the platform owner (you), one organiser, one gate staff,
 * two events and one paid booking — just enough to try every flow. Safe to re-run.
 */
export async function seed(
  db: Db,
  opts: { password: string; ownerName: string; ownerEmail: string; bcryptCost: number },
) {
  const users = usersRepository(db);
  if (await users.findByEmailOrPhone({ phone: OWNER_PHONE })) return false;

  const passwordHash = await bcrypt.hash(opts.password, opts.bcryptCost);
  await db.transaction().execute(async (trx) => {
    await usersRepository(trx).insert({
      name: opts.ownerName,
      phone: OWNER_PHONE,
      email: opts.ownerEmail,
      password_hash: passwordHash,
      role: 'OWNER',
      organiser_id: null,
    });

    const organiser = await organisersRepository(trx).insert({
      name: 'Demo Organiser',
      phone: '9000000001',
      email: 'organiser@example.com',
      commission_bps: 1000,
    });
    await usersRepository(trx).insert({
      name: 'Demo Organiser',
      phone: '9000000001',
      email: 'organiser@example.com',
      password_hash: passwordHash,
      role: 'ORGANISER',
      organiser_id: organiser.id,
    });
    await usersRepository(trx).insert({
      name: 'Gate Staff',
      phone: '9000000002',
      email: null,
      password_hash: passwordHash,
      role: 'GATE_STAFF',
      organiser_id: organiser.id,
    });

    const base = { organiser_id: organiser.id, commission_bps: organiser.commission_bps };
    const live = await eventsRepository(trx).insert({
      ...base,
      title: 'Navratri Garba Night',
      description: 'Live dhol, food stalls and a full night of garba.',
      venue: 'Shaniwar Wada Grounds, Pune',
      starts_at: new Date(Date.now() + 7 * DAY),
      ends_at: new Date(Date.now() + 7 * DAY + 6 * 3_600_000),
      price_paise: rupeesToPaise(499),
      capacity: 200,
      status: 'PUBLISHED',
    });
    await eventsRepository(trx).insert({
      ...base,
      title: 'Open Mic Evening (draft)',
      venue: 'Cafe Roots, Pune',
      starts_at: new Date(Date.now() + 14 * DAY),
      price_paise: 0,
      capacity: 50,
    });

    const amount = live.price_paise * 2;
    const split = splitCommission(amount, live.commission_bps);
    const booking = await bookingsRepository(trx).insert({
      event_id: live.id,
      customer_name: 'Asha Patil',
      customer_phone: '9876543210',
      quantity: 2,
      attendee_names: JSON.stringify(['Asha Patil', 'Rohan Patil']),
      amount_paise: amount,
      status: 'PAID',
      hold_expires_at: null,
      access_token: randomToken(),
      platform_fee_paise: split.platformFeePaise,
      organiser_share_paise: split.organiserSharePaise,
      paid_at: new Date(),
    });
    await ticketsRepository(trx).issue(booking.id, live.id, ['Asha Patil', 'Rohan Patil']);
  });
  return true;
}

// CLI: `npm run db:seed`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  try {
    await migrateToLatest(db);
    const generated = !process.env.SEED_PASSWORD;
    const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString('base64url');
    const created = await seed(db, {
      password,
      ownerName: process.env.SEED_OWNER_NAME ?? 'Platform Owner',
      ownerEmail: process.env.SEED_OWNER_EMAIL ?? 'owner@example.com',
      bcryptCost: env.BCRYPT_COST,
    });
    if (!created) {
      console.log('Seed data already present — nothing to do.');
    } else {
      console.log('Seeded. Sign in with phone or email + the password below (shown once):');
      console.log(
        `  owner      ${OWNER_PHONE}  |  ${process.env.SEED_OWNER_EMAIL ?? 'owner@example.com'}`,
      );
      console.log('  organiser  9000000001  |  organiser@example.com');
      console.log('  gate staff 9000000002');
      console.log(`  password   ${password}${generated ? '   (generated)' : ''}`);
    }
  } finally {
    await db.destroy();
  }
}
