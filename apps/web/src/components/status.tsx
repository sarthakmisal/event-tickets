import type { BookingStatus, EventStatus, MessageStatus, TicketState } from '@et/shared';
import { Pill } from './ui';
import type { Tone } from './ui';

const EVENT: Record<EventStatus, [Tone, string]> = {
  DRAFT: ['', 'Draft'],
  PUBLISHED: ['good', 'Live'],
  CANCELLED: ['bad', 'Cancelled'],
};
const BOOKING: Record<BookingStatus, [Tone, string]> = {
  PENDING: ['warn', 'Awaiting payment'],
  PAID: ['good', 'Paid'],
  EXPIRED: ['', 'Expired'],
  CANCELLED: ['bad', 'Cancelled'],
};
const TICKET: Record<TicketState, [Tone, string]> = {
  ISSUED: ['accent', 'Not entered'],
  INSIDE: ['good', 'Inside'],
  EXITED: ['warn', 'Exited'],
  VOID: ['bad', 'Void'],
};
const MESSAGE: Record<MessageStatus, [Tone, string]> = {
  QUEUED: ['warn', 'Queued'],
  SENDING: ['warn', 'Sending'],
  SENT: ['good', 'Sent'],
  FAILED: ['bad', 'Failed'],
};

export const EventStatusPill = ({ status }: { status: EventStatus }) => (
  <Pill tone={EVENT[status][0]} live={status === 'PUBLISHED'}>
    {EVENT[status][1]}
  </Pill>
);
export const BookingStatusPill = ({ status }: { status: BookingStatus }) => (
  <Pill tone={BOOKING[status][0]}>{BOOKING[status][1]}</Pill>
);
export const TicketStatePill = ({ state }: { state: TicketState }) => (
  <Pill tone={TICKET[state][0]}>{TICKET[state][1]}</Pill>
);
export const MessageStatusPill = ({ status }: { status: MessageStatus }) => (
  <Pill tone={MESSAGE[status][0]}>{MESSAGE[status][1]}</Pill>
);
