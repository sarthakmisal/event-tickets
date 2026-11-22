import type { MessageDto } from '@et/shared';
import type { Db } from '../../db/schema';
import { WhatsAppUnavailableError } from '../../integrations/whatsapp/provider';
import type { WhatsAppProvider } from '../../integrations/whatsapp/provider';
import type { Clock } from '../../shared/clock';
import { notFound } from '../../shared/errors';
import type { Logger } from '../../shared/logger';
import type { Actor } from '../auth/actor';
import { organiserScope } from '../auth/actor';
import { messagesRepository } from './messages.repository';
import type { MessageRow } from './messages.repository';

export const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const UNAVAILABLE_RETRY_MS = 60_000;
const backoffMs = (attempt: number) => 2 ** attempt * 60_000;

const toDto = (m: MessageRow): MessageDto => ({
  id: m.id,
  bookingId: m.booking_id,
  toPhone: m.to_phone,
  body: m.body,
  status: m.status,
  attempts: m.attempts,
  lastError: m.last_error,
  createdAt: m.created_at.toISOString(),
  sentAt: m.sent_at?.toISOString() ?? null,
});

/** Outbox worker + read model. Messages are written by the booking flow, delivered here. */
export function createMessagingService(
  db: Db,
  provider: WhatsAppProvider,
  clock: Clock,
  log: Logger,
) {
  const repo = messagesRepository(db);

  return {
    /** Sends every due message once; failures are retried with exponential backoff. */
    async processDue(): Promise<number> {
      const claimed = await repo.claimDue(clock(), BATCH_SIZE);
      for (const message of claimed) {
        try {
          const senderKey = await repo.organiserIdOf(message.booking_id);
          await provider.send({ toPhone: message.to_phone, body: message.body, senderKey });
          await repo.markSent(message.id, clock());
        } catch (err) {
          if (err instanceof WhatsAppUnavailableError) {
            // Not the message's fault (number not linked, daily cap): keep it queued, spend no attempt.
            await repo.markAttemptFailed(message.id, {
              attempts: message.attempts,
              status: 'QUEUED',
              nextAttemptAt: new Date(clock().getTime() + UNAVAILABLE_RETRY_MS),
              error: err.message,
            });
            continue;
          }
          const attempts = message.attempts + 1;
          const exhausted = attempts >= MAX_ATTEMPTS;
          log.warn({ err, messageId: message.id, attempts }, 'whatsapp send failed');
          await repo.markAttemptFailed(message.id, {
            attempts,
            status: exhausted ? 'FAILED' : 'QUEUED',
            nextAttemptAt: new Date(clock().getTime() + backoffMs(attempts)),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return claimed.length;
    },

    async list(actor: Actor): Promise<MessageDto[]> {
      return (await repo.list(organiserScope(actor), 100)).map(toDto);
    },

    async resend(actor: Actor, id: string): Promise<MessageDto> {
      const message = await repo.findScoped(id, organiserScope(actor));
      if (!message) throw notFound('Message');
      await repo.requeue(id, clock());
      const updated = await repo.findScoped(id, organiserScope(actor));
      return toDto(updated ?? message);
    },
  };
}

export type MessagingService = ReturnType<typeof createMessagingService>;
