import { extractTicketCode } from '@et/shared';
import type { TicketViewDto } from '@et/shared';
import type { Db } from '../../db/schema';
import { notFound } from '../../shared/errors';
import { toTicketDto } from '../bookings/booking.mapper';
import { ticketsRepository } from './tickets.repository';

export function createTicketsService(db: Db) {
  return {
    /** The ticket code itself is the bearer secret (50 bits of entropy), as in the QR link. */
    async view(rawCode: string): Promise<TicketViewDto> {
      const code = extractTicketCode(rawCode);
      const ticket = code ? await ticketsRepository(db).findByCode(code) : undefined;
      if (!ticket) throw notFound('Ticket');
      return {
        ticket: toTicketDto(ticket),
        eventTitle: ticket.event_title,
        venue: ticket.event_venue,
        startsAt: ticket.event_starts_at.toISOString(),
      };
    },
  };
}

export type TicketsService = ReturnType<typeof createTicketsService>;
