import { sql } from 'kysely';
import type { DashboardDto } from '@et/shared';
import type { Db } from '../../db/schema';
import type { Clock } from '../../shared/clock';
import type { Actor } from '../auth/actor';
import { organiserScope } from '../auth/actor';
import { messagesRepository } from '../messaging/messages.repository';

export function createDashboardService(db: Db, clock: Clock) {
  return {
    async summary(actor: Actor): Promise<DashboardDto> {
      const scope = organiserScope(actor);
      const now = clock();

      let sales = db
        .selectFrom('bookings as b')
        .innerJoin('events as e', 'e.id', 'b.event_id')
        .select([
          sql<number>`coalesce(sum(b.amount_paise), 0)::int`.as('gross'),
          sql<number>`coalesce(sum(b.platform_fee_paise), 0)::int`.as('fee'),
          sql<number>`coalesce(sum(b.organiser_share_paise), 0)::int`.as('share'),
          sql<number>`count(*)::int`.as('bookings'),
          sql<number>`coalesce(sum(b.quantity), 0)::int`.as('tickets'),
        ])
        .where('b.status', '=', 'PAID');
      let live = db
        .selectFrom('events as e')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('e.status', '=', 'PUBLISHED')
        .where(sql<boolean>`coalesce(e.ends_at, e.starts_at + interval '12 hours') > ${now}`);
      let inside = db
        .selectFrom('tickets as t')
        .innerJoin('events as e', 'e.id', 't.event_id')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('t.state', '=', 'INSIDE');

      if (scope) {
        sales = sales.where('e.organiser_id', '=', scope);
        live = live.where('e.organiser_id', '=', scope);
        inside = inside.where('e.organiser_id', '=', scope);
      }

      const [s, l, i, pending, organisers] = await Promise.all([
        sales.executeTakeFirstOrThrow(),
        live.executeTakeFirstOrThrow(),
        inside.executeTakeFirstOrThrow(),
        messagesRepository(db).countUndelivered(scope),
        scope
          ? Promise.resolve(null)
          : db
              .selectFrom('organisers')
              .select(sql<number>`count(*)::int`.as('n'))
              .executeTakeFirstOrThrow()
              .then((r) => r.n),
      ]);

      return {
        scope: scope ? 'organiser' : 'platform',
        grossPaise: s.gross,
        platformFeePaise: s.fee,
        organiserSharePaise: s.share,
        paidBookings: s.bookings,
        ticketsSold: s.tickets,
        liveEvents: l.n,
        inside: i.n,
        organisers,
        pendingMessages: pending,
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
