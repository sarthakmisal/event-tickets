import type { CreateEventInput, EventDto, PublicEventDto, UpdateEventInput } from '@et/shared';
import type { Db } from '../../db/schema';
import type { Clock } from '../../shared/clock';
import { conflict, notFound } from '../../shared/errors';
import type { Actor } from '../auth/actor';
import { organiserScope } from '../auth/actor';
import { bookingsRepository } from '../bookings/bookings.repository';
import { organisersRepository } from '../organisers/organisers.repository';
import { ticketsRepository } from '../tickets/tickets.repository';
import { toEventDto, toPublicEventDto } from './event.mapper';
import { eventsRepository } from './events.repository';
import type { EventWithCounts } from './events.repository';

export function createEventsService(db: Db, clock: Clock) {
  /** Organisers only see their own events; a foreign id looks the same as a missing one. */
  async function loadManaged(actor: Actor, id: string): Promise<EventWithCounts> {
    const event = await eventsRepository(db).findWithCounts(id, clock());
    const scope = organiserScope(actor);
    if (!event || (scope && event.organiser_id !== scope)) throw notFound('Event');
    return event;
  }

  return {
    /** Customer-facing: published events that are still open for booking. */
    async listPublic(): Promise<PublicEventDto[]> {
      const now = clock();
      const rows = await eventsRepository(db).list(
        { organiserId: null, statuses: ['PUBLISHED'] },
        now,
      );
      return rows
        .map((e) => toPublicEventDto(e, now))
        .filter((e) => e.open)
        .reverse();
    },

    async getPublic(id: string): Promise<PublicEventDto> {
      const event = await eventsRepository(db).findWithCounts(id, clock());
      if (!event || event.status === 'DRAFT') throw notFound('Event');
      return toPublicEventDto(event, clock());
    },

    async list(actor: Actor): Promise<EventDto[]> {
      const rows = await eventsRepository(db).list({ organiserId: organiserScope(actor) }, clock());
      return rows.map(toEventDto);
    },

    async get(actor: Actor, id: string): Promise<EventDto> {
      return toEventDto(await loadManaged(actor, id));
    },

    async create(actor: Actor, input: CreateEventInput): Promise<EventDto> {
      const organiser = actor.organiserId
        ? await organisersRepository(db).findById(actor.organiserId)
        : undefined;
      if (!organiser) throw notFound('Organiser');
      const row = await eventsRepository(db).insert({
        organiser_id: organiser.id,
        title: input.title,
        description: input.description,
        venue: input.venue,
        starts_at: new Date(input.startsAt),
        ends_at: input.endsAt ? new Date(input.endsAt) : null,
        price_paise: input.pricePaise,
        capacity: input.capacity,
        commission_bps: organiser.commission_bps,
      });
      return this.get(actor, row.id);
    },

    async update(actor: Actor, id: string, input: UpdateEventInput): Promise<EventDto> {
      const event = await loadManaged(actor, id);
      if (event.status === 'CANCELLED') throw conflict('A cancelled event cannot be changed');

      const startsAt = input.startsAt ? new Date(input.startsAt) : event.starts_at;
      const endsAt =
        input.endsAt !== undefined ? (input.endsAt ? new Date(input.endsAt) : null) : event.ends_at;
      if (endsAt && endsAt <= startsAt) throw conflict('End must be after start', 'endsAt');
      if (input.capacity !== undefined && input.capacity < event.sold + event.held) {
        throw conflict(
          `Capacity cannot be below the ${event.sold + event.held} seats already taken`,
          'capacity',
        );
      }
      if (input.status === 'DRAFT' && event.sold > 0) {
        throw conflict('Tickets are already sold; cancel the event instead of unpublishing');
      }

      await db.transaction().execute(async (trx) => {
        await eventsRepository(trx).update(id, {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.venue !== undefined && { venue: input.venue }),
          ...(input.pricePaise !== undefined && { price_paise: input.pricePaise }),
          ...(input.capacity !== undefined && { capacity: input.capacity }),
          ...(input.status !== undefined && { status: input.status }),
          starts_at: startsAt,
          ends_at: endsAt,
        });
        if (input.status === 'CANCELLED') {
          await bookingsRepository(trx).cancelForEvent(id);
          await ticketsRepository(trx).voidForEvent(id);
        }
      });
      return this.get(actor, id);
    },
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
