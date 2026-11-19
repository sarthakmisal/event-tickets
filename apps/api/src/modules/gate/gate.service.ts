import {
  decideScan,
  expectedStatesFor,
  extractTicketCode,
  SCAN_REJECTION_MESSAGES,
} from '@et/shared';
import type { EventDto, ScanInput, ScanLogDto, ScanRejection, ScanResultDto } from '@et/shared';
import type { Db } from '../../db/schema';
import type { Clock } from '../../shared/clock';
import { notFound } from '../../shared/errors';
import type { Actor } from '../auth/actor';
import { toEventDto } from '../events/event.mapper';
import { eventsRepository } from '../events/events.repository';
import { ticketsRepository } from '../tickets/tickets.repository';
import type { TicketWithEvent } from '../tickets/tickets.repository';
import { scanLogsRepository } from './scan-logs.repository';

const MAX_RACE_RETRIES = 3;

/** Owner and organiser-less gate staff can scan anything; everyone else only their organiser's events. */
function gateScope(actor: Actor): string | null {
  if (actor.role === 'OWNER') return null;
  return actor.organiserId;
}

export function createGateService(db: Db, clock: Clock) {
  const tickets = ticketsRepository(db);
  const logs = scanLogsRepository(db);

  async function respond(
    actor: Actor,
    input: { mode: ScanResultDto['mode']; code: string },
    ticket: TicketWithEvent | undefined,
    reason: ScanRejection | null,
  ): Promise<ScanResultDto> {
    await logs.insert({
      event_id: ticket?.event_id ?? null,
      ticket_id: ticket?.id ?? null,
      code: input.code.slice(0, 64),
      mode: input.mode,
      ok: reason === null,
      reason,
      scanned_by: actor.id,
    });
    const okMessage = input.mode === 'ENTRY' ? 'Entry allowed' : 'Exit recorded';
    return {
      ok: reason === null,
      mode: input.mode,
      code: input.code,
      reason,
      message: reason ? SCAN_REJECTION_MESSAGES[reason] : okMessage,
      attendeeName: ticket?.attendee_name ?? null,
      eventTitle: ticket?.event_title ?? null,
      inside: ticket ? await tickets.countInside(ticket.event_id) : null,
    };
  }

  return {
    /** Events the actor can scan for: published only. */
    async events(actor: Actor): Promise<EventDto[]> {
      const rows = await eventsRepository(db).list(
        { organiserId: gateScope(actor), statuses: ['PUBLISHED'] },
        clock(),
      );
      return rows.map(toEventDto);
    },

    async scan(actor: Actor, input: ScanInput): Promise<ScanResultDto> {
      const code = extractTicketCode(input.code);
      if (!code)
        return respond(actor, { mode: input.mode, code: input.code }, undefined, 'NOT_FOUND');

      const ticket = await tickets.findByCode(code);
      const scope = gateScope(actor);
      // A ticket from another organiser looks exactly like an unknown one.
      if (!ticket || (scope && ticket.organiser_id !== scope)) {
        return respond(actor, { mode: input.mode, code }, undefined, 'NOT_FOUND');
      }
      const ctx = { mode: input.mode, code };
      if (input.eventId && ticket.event_id !== input.eventId)
        return respond(actor, ctx, ticket, 'WRONG_EVENT');
      if (ticket.event_status !== 'PUBLISHED')
        return respond(actor, ctx, ticket, 'EVENT_NOT_ACTIVE');

      // Compare-and-set so two phones scanning the same ticket can never both get through.
      let state = ticket.state;
      for (let attempt = 0; attempt < MAX_RACE_RETRIES; attempt += 1) {
        const decision = decideScan(state, input.mode);
        if (!decision.ok) return respond(actor, ctx, ticket, decision.reason);
        if (await tickets.transition(ticket.id, expectedStatesFor(input.mode), decision.next)) {
          return respond(actor, ctx, ticket, null);
        }
        state = (await tickets.currentState(ticket.id)) ?? state;
      }
      return respond(
        actor,
        ctx,
        ticket,
        input.mode === 'ENTRY' ? 'ALREADY_INSIDE' : 'ALREADY_EXITED',
      );
    },

    async recent(actor: Actor, eventId: string): Promise<ScanLogDto[]> {
      const event = await eventsRepository(db).findById(eventId);
      const scope = gateScope(actor);
      if (!event || (scope && event.organiser_id !== scope)) throw notFound('Event');
      const rows = await scanLogsRepository(db).recentForEvent(eventId, 25);
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        mode: r.mode,
        ok: r.ok,
        reason: r.reason as ScanRejection | null,
        attendeeName: r.attendee_name,
        scannedBy: r.scanned_by_name,
        createdAt: r.created_at.toISOString(),
      }));
    },
  };
}

export type GateService = ReturnType<typeof createGateService>;
