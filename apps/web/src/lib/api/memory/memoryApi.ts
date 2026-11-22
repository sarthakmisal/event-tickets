import type { ZodTypeAny, z } from 'zod';
import {
  bookingTotal,
  confirmPaymentSchema,
  createBookingSchema,
  createEventSchema,
  createOrganiserSchema,
  createStaffSchema,
  decideScan,
  extractTicketCode,
  formatINR,
  generateTicketCode,
  holdExpiresAt,
  isEventOpen,
  loginSchema,
  MAX_TICKETS_PER_BOOKING,
  MESSAGE_TEMPLATES,
  phoneSchema,
  renderTemplate,
  scanSchema,
  SCAN_REJECTION_MESSAGES,
  seatsRemaining,
  splitCommission,
  updateEventSchema,
  updateOrganiserSchema,
} from '@et/shared';
import type {
  BookingDto,
  BookingStatus,
  DashboardDto,
  EventDto,
  EventStatus,
  MessageDto,
  MessageStatus,
  OrganiserDto,
  PublicEventDto,
  Role,
  ScanLogDto,
  ScanMode,
  ScanRejection,
  TicketState,
  UserDto,
  WhatsAppStatusDto,
} from '@et/shared';
import { ApiError } from '../types';
import type { Api } from '../types';

/**
 * In-browser implementation of the API. It reuses the exact rules from @et/shared (commission
 * split, gate state machine, capacity, validation schemas) and mirrors the server's behaviour and
 * error codes, so what you see here is what the real backend does — minus the database.
 */

interface Org {
  id: string;
  name: string;
  phone: string;
  email: string;
  commissionBps: number;
  active: boolean;
  createdAt: Date;
}
interface User {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  password: string;
  role: Role;
  organiserId: string | null;
  active: boolean;
}
interface Ev {
  id: string;
  organiserId: string;
  title: string;
  description: string;
  venue: string;
  startsAt: Date;
  endsAt: Date | null;
  pricePaise: number;
  capacity: number;
  status: EventStatus;
  commissionBps: number;
}
interface Bk {
  id: string;
  eventId: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  attendeeNames: string[];
  amountPaise: number;
  status: BookingStatus;
  holdExpiresAt: Date | null;
  accessToken: string;
  platformFeePaise: number;
  organiserSharePaise: number;
  needsRefund: boolean;
  paidAt: Date | null;
  createdAt: Date;
}
interface Tk {
  id: string;
  bookingId: string;
  eventId: string;
  code: string;
  attendeeName: string;
  state: TicketState;
}
interface Msg {
  id: string;
  bookingId: string;
  toPhone: string;
  body: string;
  status: MessageStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
}
interface Scan {
  id: string;
  eventId: string | null;
  ticketId: string | null;
  code: string;
  mode: ScanMode;
  ok: boolean;
  reason: ScanRejection | null;
  userId: string;
  createdAt: Date;
}
interface Pay {
  orderId: string;
  bookingId: string;
  amountPaise: number;
  captured: boolean;
}

export interface Persona {
  label: string;
  login: string;
  role: Role;
}

export interface DemoControls {
  personas: Persona[];
  /** Jump the demo clock forward (e.g. to let a seat hold expire). */
  advanceMinutes(minutes: number): void;
  /** Make WhatsApp sends fail so the retry/backoff behaviour is visible. */
  setWhatsAppFailing(failing: boolean): void;
  isWhatsAppFailing(): boolean;
  /** Ticket codes of an event, for quick scanner testing. */
  ticketCodes(
    eventId?: string,
  ): { code: string; attendeeName: string; state: TicketState; eventId: string }[];
  publicEventId(): string | null;
  subscribe(listener: () => void): () => void;
}

export const DEMO_PASSWORD = 'demo1234';
const WEB_URL = 'https://tickets.example.com';
const SLOW = 140;
const DAY = 86_400_000;
const MAX_ATTEMPTS = 5;

const uid = () => crypto.randomUUID();
const randomInt = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0]! % max;
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) =>
    b.toString(36).padStart(2, '0'),
  ).join('');

const when = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

const fail = (status: number, code: string, message: string, field?: string): never => {
  throw new ApiError(code, message, field, status);
};
const notFound = (what: string) => fail(404, 'NOT_FOUND', `${what} not found`);
const forbidden = () => fail(403, 'FORBIDDEN', 'You do not have access to this');

function parse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  return fail(
    400,
    'VALIDATION',
    issue?.message ?? 'Invalid input',
    issue?.path.join('.') || undefined,
  );
}

export function createMemoryApi(): { api: Api; demo: DemoControls } {
  let offset = 0;
  let failingWhatsApp = false;
  let sessionUserId: string | null = null;
  const now = () => new Date(Date.now() + offset);

  const orgs: Org[] = [];
  const users: User[] = [];
  const events: Ev[] = [];
  const bookings: Bk[] = [];
  const tickets: Tk[] = [];
  const messages: Msg[] = [];
  const waLinks = new Map<string, { since: number; connected: boolean }>();
  const waKey = (u: User) => u.organiserId ?? 'platform';
  const waStatus = (u: User): WhatsAppStatusDto => {
    const link = waLinks.get(waKey(u));
    if (link && !link.connected && Date.now() - link.since > 4000) link.connected = true;
    const state = !link ? 'DISCONNECTED' : link.connected ? 'CONNECTED' : 'QR';
    return {
      supported: true,
      scope: u.organiserId ? 'ORGANISER' : 'PLATFORM',
      state,
      qr: state === 'QR' ? `DEMO-QR-${waKey(u)}-${link?.since ?? 0}` : null,
      phone: state === 'CONNECTED' ? '919999999999' : null,
      error: null,
      fallbackConnected: false,
    };
  };
  const scans: Scan[] = [];
  const payments: Pay[] = [];
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());

  // ---------- seed (mirrors apps/api/src/db/seed.ts) ----------
  const org: Org = {
    id: uid(),
    name: 'Demo Organiser',
    phone: '9000000001',
    email: 'organiser@example.com',
    commissionBps: 1000,
    active: true,
    createdAt: now(),
  };
  orgs.push(org);
  users.push(
    {
      id: uid(),
      name: 'Platform Owner',
      phone: '7498605559',
      email: 'owner@example.com',
      password: DEMO_PASSWORD,
      role: 'OWNER',
      organiserId: null,
      active: true,
    },
    {
      id: uid(),
      name: 'Demo Organiser',
      phone: org.phone,
      email: org.email,
      password: DEMO_PASSWORD,
      role: 'ORGANISER',
      organiserId: org.id,
      active: true,
    },
    {
      id: uid(),
      name: 'Gate Staff',
      phone: '9000000002',
      email: null,
      password: DEMO_PASSWORD,
      role: 'GATE_STAFF',
      organiserId: org.id,
      active: true,
    },
  );
  const live: Ev = {
    id: uid(),
    organiserId: org.id,
    title: 'Navratri Garba Night',
    description: 'Live dhol, food stalls and a full night of garba.',
    venue: 'Shaniwar Wada Grounds, Pune',
    startsAt: new Date(Date.now() + 7 * DAY),
    endsAt: new Date(Date.now() + 7 * DAY + 6 * 3_600_000),
    pricePaise: 49_900,
    capacity: 200,
    status: 'PUBLISHED',
    commissionBps: org.commissionBps,
  };
  events.push(live, {
    id: uid(),
    organiserId: org.id,
    title: 'Open Mic Evening (draft)',
    description: '',
    venue: 'Cafe Roots, Pune',
    startsAt: new Date(Date.now() + 14 * DAY),
    endsAt: null,
    pricePaise: 0,
    capacity: 50,
    status: 'DRAFT',
    commissionBps: org.commissionBps,
  });
  {
    const amount = live.pricePaise * 2;
    const split = splitCommission(amount, live.commissionBps);
    const id = uid();
    bookings.push({
      id,
      eventId: live.id,
      customerName: 'Asha Patil',
      customerPhone: '9876543210',
      quantity: 2,
      attendeeNames: ['Asha Patil', 'Rohan Patil'],
      amountPaise: amount,
      status: 'PAID',
      holdExpiresAt: null,
      accessToken: token(),
      platformFeePaise: split.platformFeePaise,
      organiserSharePaise: split.organiserSharePaise,
      needsRefund: false,
      paidAt: now(),
      createdAt: now(),
    });
    for (const name of ['Asha Patil', 'Rohan Patil'])
      tickets.push({
        id: uid(),
        bookingId: id,
        eventId: live.id,
        code: generateTicketCode(randomInt),
        attendeeName: name,
        state: 'ISSUED',
      });
  }

  // ---------- helpers ----------
  const sleep = () => new Promise((r) => setTimeout(r, SLOW));
  async function call<T>(fn: () => T): Promise<T> {
    await sleep();
    drainOutbox();
    return fn();
  }

  const byId = <T extends { id: string }>(list: T[], id: string, what: string): T =>
    list.find((x) => x.id === id) ?? notFound(what);
  const currentUser = (): User => {
    const user = users.find((u) => u.id === sessionUserId);
    const orgActive = !user?.organiserId || orgs.find((o) => o.id === user.organiserId)?.active;
    if (!user || !user.active || !orgActive) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
    return user;
  };
  const requireRole = (...roles: Role[]): User => {
    const user = currentUser();
    return roles.includes(user.role) ? user : forbidden();
  };
  /** null = all organisers (owner). */
  const scopeOf = (u: User): string | null =>
    u.role === 'OWNER' ? null : (u.organiserId ?? forbidden());
  const gateScope = (u: User): string | null => (u.role === 'OWNER' ? null : u.organiserId);

  const counts = (e: Ev) => {
    const t = now();
    const mine = bookings.filter((b) => b.eventId === e.id);
    return {
      sold: mine.filter((b) => b.status === 'PAID').reduce((n, b) => n + b.quantity, 0),
      held: mine
        .filter((b) => b.status === 'PENDING' && b.holdExpiresAt !== null && b.holdExpiresAt > t)
        .reduce((n, b) => n + b.quantity, 0),
      inside: tickets.filter((k) => k.eventId === e.id && k.state === 'INSIDE').length,
    };
  };
  const orgOf = (e: Ev) => byId(orgs, e.organiserId, 'Organiser');

  const eventDto = (e: Ev): EventDto => {
    const c = counts(e);
    return {
      id: e.id,
      organiserId: e.organiserId,
      organiserName: orgOf(e).name,
      title: e.title,
      description: e.description,
      venue: e.venue,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt?.toISOString() ?? null,
      pricePaise: e.pricePaise,
      capacity: e.capacity,
      status: e.status,
      commissionBps: e.commissionBps,
      ...c,
      remaining: seatsRemaining(e.capacity, c.sold, c.held),
    };
  };
  const publicEventDto = (e: Ev): PublicEventDto => {
    const c = counts(e);
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      venue: e.venue,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt?.toISOString() ?? null,
      pricePaise: e.pricePaise,
      remaining: seatsRemaining(e.capacity, c.sold, c.held),
      maxPerBooking: MAX_TICKETS_PER_BOOKING,
      organiserName: orgOf(e).name,
      open: isEventOpen(e.status, e.startsAt, e.endsAt, now()),
    };
  };
  const bookingDto = (b: Bk): BookingDto => ({
    id: b.id,
    eventId: b.eventId,
    eventTitle: byId(events, b.eventId, 'Event').title,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    quantity: b.quantity,
    amountPaise: b.amountPaise,
    platformFeePaise: b.platformFeePaise,
    organiserSharePaise: b.organiserSharePaise,
    status: b.status,
    needsRefund: b.needsRefund,
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
    paidAt: b.paidAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    tickets: tickets
      .filter((t) => t.bookingId === b.id)
      .map((t) => ({ id: t.id, code: t.code, attendeeName: t.attendeeName, state: t.state })),
  });
  const userDto = (u: User): UserDto => ({
    id: u.id,
    name: u.name,
    role: u.role,
    phone: u.phone,
    email: u.email,
    organiserId: u.organiserId,
    organiserName: orgs.find((o) => o.id === u.organiserId)?.name ?? null,
    active: u.active,
  });
  const orgDto = (o: Org): OrganiserDto => ({
    id: o.id,
    name: o.name,
    phone: o.phone,
    email: o.email,
    commissionBps: o.commissionBps,
    active: o.active,
    eventCount: events.filter((e) => e.organiserId === o.id).length,
    createdAt: o.createdAt.toISOString(),
  });
  const msgDto = (m: Msg): MessageDto => ({
    id: m.id,
    bookingId: m.bookingId,
    toPhone: m.toPhone,
    body: m.body,
    status: m.status,
    attempts: m.attempts,
    lastError: m.lastError,
    createdAt: m.createdAt.toISOString(),
    sentAt: m.sentAt?.toISOString() ?? null,
  });

  const manageableEvent = (u: User, id: string): Ev => {
    const e = events.find((x) => x.id === id);
    const scope = scopeOf(u);
    return !e || (scope && e.organiserId !== scope) ? notFound('Event') : e;
  };
  const ownBookingIds = (u: User) => {
    const scope = scopeOf(u);
    return bookings.filter((b) => !scope || byId(events, b.eventId, 'Event').organiserId === scope);
  };

  // ---------- fulfilment (mirrors fulfilment.service.ts) ----------
  function fulfil(e: Ev, b: Bk) {
    const split = splitCommission(b.amountPaise, e.commissionBps);
    Object.assign(b, {
      status: 'PAID',
      paidAt: now(),
      holdExpiresAt: null,
      platformFeePaise: split.platformFeePaise,
      organiserSharePaise: split.organiserSharePaise,
    });
    for (let i = 0; i < b.quantity; i += 1) {
      const name =
        b.attendeeNames[i]?.trim() || (i === 0 ? b.customerName : `${b.customerName} +${i}`);
      tickets.push({
        id: uid(),
        bookingId: b.id,
        eventId: e.id,
        code: generateTicketCode(randomInt),
        attendeeName: name,
        state: 'ISSUED',
      });
    }
    if (!messages.some((m) => m.bookingId === b.id)) {
      messages.push({
        id: uid(),
        bookingId: b.id,
        toPhone: `91${b.customerPhone}`,
        status: 'QUEUED',
        attempts: 0,
        nextAttemptAt: now(),
        lastError: null,
        createdAt: now(),
        sentAt: null,
        body: renderTemplate(MESSAGE_TEMPLATES.BOOKING_CONFIRMED, {
          name: b.customerName,
          event: e.title,
          quantity: b.quantity,
          amount: b.amountPaise === 0 ? 'Free' : formatINR(b.amountPaise),
          when: when.format(e.startsAt),
          venue: e.venue,
          link: `${WEB_URL}/b/${b.id}?t=${b.accessToken}`,
        }),
      });
      setTimeout(() => {
        drainOutbox();
        changed();
      }, 1500);
    }
  }

  function settle(orderId: string) {
    const pay = payments.find((p) => p.orderId === orderId) ?? notFound('Payment');
    if (pay.captured) return;
    pay.captured = true;
    const b = byId(bookings, pay.bookingId, 'Booking');
    const e = byId(events, b.eventId, 'Event');
    if (b.status === 'PAID') return;
    const holdLive = b.status === 'PENDING' && b.holdExpiresAt !== null && b.holdExpiresAt > now();
    if (!holdLive) {
      const c = counts(e);
      const canHonour =
        b.status !== 'CANCELLED' &&
        e.status === 'PUBLISHED' &&
        seatsRemaining(e.capacity, c.sold, c.held) >= b.quantity;
      if (!canHonour) {
        b.needsRefund = true;
        return;
      }
    }
    fulfil(e, b);
  }

  /** Stands in for the background outbox worker. */
  function drainOutbox() {
    const t = now();
    for (const m of messages) {
      if (m.status !== 'QUEUED' || m.nextAttemptAt > t) continue;
      if (failingWhatsApp) {
        m.attempts += 1;
        m.lastError = 'WhatsApp gateway unreachable (simulated)';
        m.status = m.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'QUEUED';
        m.nextAttemptAt = new Date(t.getTime() + 2 ** m.attempts * 60_000);
      } else {
        m.status = 'SENT';
        m.sentAt = t;
        m.lastError = null;
      }
    }
    for (const b of bookings)
      if (b.status === 'PENDING' && b.holdExpiresAt && b.holdExpiresAt <= t) b.status = 'EXPIRED';
  }

  function publicBooking(id: string, t: string) {
    const b = bookings.find((x) => x.id === id);
    if (!b || b.accessToken !== t) return notFound('Booking');
    return { booking: bookingDto(b), event: publicEventDto(byId(events, b.eventId, 'Event')) };
  }

  const api: Api = {
    auth: {
      login: (input) =>
        call(() => {
          const { login, password } = parse(loginSchema, input);
          const phone = phoneSchema.safeParse(login);
          const user = users.find((u) =>
            login.includes('@')
              ? u.email?.toLowerCase() === login.trim().toLowerCase()
              : phone.success && u.phone === phone.data,
          );
          if (!user || user.password !== password)
            return fail(401, 'UNAUTHENTICATED', 'Wrong login or password');
          if (
            !user.active ||
            (user.organiserId && !orgs.find((o) => o.id === user.organiserId)?.active)
          )
            return forbidden();
          sessionUserId = user.id;
          return userDto(user);
        }),
      logout: () =>
        call(() => {
          sessionUserId = null;
        }),
      me: () =>
        call(() => {
          try {
            return userDto(currentUser());
          } catch {
            return null;
          }
        }),
    },

    dashboard: {
      get: () =>
        call((): DashboardDto => {
          const u = requireRole('OWNER', 'ORGANISER');
          const scope = scopeOf(u);
          const paid = ownBookingIds(u).filter((b) => b.status === 'PAID');
          const mine = events.filter((e) => !scope || e.organiserId === scope);
          const t = now();
          return {
            scope: scope ? 'organiser' : 'platform',
            grossPaise: paid.reduce((n, b) => n + b.amountPaise, 0),
            platformFeePaise: paid.reduce((n, b) => n + b.platformFeePaise, 0),
            organiserSharePaise: paid.reduce((n, b) => n + b.organiserSharePaise, 0),
            paidBookings: paid.length,
            ticketsSold: paid.reduce((n, b) => n + b.quantity, 0),
            liveEvents: mine.filter((e) => isEventOpen(e.status, e.startsAt, e.endsAt, t)).length,
            inside: tickets.filter(
              (k) => k.state === 'INSIDE' && mine.some((e) => e.id === k.eventId),
            ).length,
            organisers: scope ? null : orgs.length,
            pendingMessages: messages.filter(
              (m) => m.status !== 'SENT' && ownBookingIds(u).some((b) => b.id === m.bookingId),
            ).length,
          };
        }),
    },

    organisers: {
      list: () =>
        call(() => {
          requireRole('OWNER');
          return [...orgs].reverse().map(orgDto);
        }),
      create: (input) =>
        call(() => {
          requireRole('OWNER');
          const i = parse(createOrganiserSchema, input);
          if (users.some((u) => u.phone === i.phone || u.email?.toLowerCase() === i.email))
            return fail(409, 'CONFLICT', 'A user with this phone or email already exists', 'phone');
          const o: Org = {
            id: uid(),
            name: i.name,
            phone: i.phone,
            email: i.email,
            commissionBps: i.commissionBps,
            active: true,
            createdAt: now(),
          };
          orgs.push(o);
          users.push({
            id: uid(),
            name: i.name,
            phone: i.phone,
            email: i.email,
            password: i.password,
            role: 'ORGANISER',
            organiserId: o.id,
            active: true,
          });
          return orgDto(o);
        }),
      update: (id, input) =>
        call(() => {
          requireRole('OWNER');
          const i = parse(updateOrganiserSchema, input);
          const o = byId(orgs, id, 'Organiser');
          if (i.commissionBps !== undefined) o.commissionBps = i.commissionBps; // existing events keep their snapshot
          if (i.active !== undefined) o.active = i.active;
          return orgDto(o);
        }),
    },

    events: {
      list: () =>
        call(() => {
          const scope = scopeOf(requireRole('OWNER', 'ORGANISER'));
          return events
            .filter((e) => !scope || e.organiserId === scope)
            .sort((a, b) => +b.startsAt - +a.startsAt)
            .map(eventDto);
        }),
      get: (id) => call(() => eventDto(manageableEvent(requireRole('OWNER', 'ORGANISER'), id))),
      create: (input) =>
        call(() => {
          const u = requireRole('ORGANISER');
          const i = parse(createEventSchema, input);
          const o = byId(orgs, u.organiserId ?? '', 'Organiser');
          const e: Ev = {
            id: uid(),
            organiserId: o.id,
            title: i.title,
            description: i.description,
            venue: i.venue,
            startsAt: new Date(i.startsAt),
            endsAt: i.endsAt ? new Date(i.endsAt) : null,
            pricePaise: i.pricePaise,
            capacity: i.capacity,
            status: 'DRAFT',
            commissionBps: o.commissionBps,
          };
          events.push(e);
          return eventDto(e);
        }),
      update: (id, input) =>
        call(() => {
          const u = requireRole('OWNER', 'ORGANISER');
          const i = parse(updateEventSchema, input);
          const e = manageableEvent(u, id);
          if (e.status === 'CANCELLED')
            return fail(409, 'CONFLICT', 'A cancelled event cannot be changed');
          const c = counts(e);
          const startsAt = i.startsAt ? new Date(i.startsAt) : e.startsAt;
          const endsAt = i.endsAt !== undefined ? (i.endsAt ? new Date(i.endsAt) : null) : e.endsAt;
          if (endsAt && endsAt <= startsAt)
            return fail(409, 'CONFLICT', 'End must be after start', 'endsAt');
          if (i.capacity !== undefined && i.capacity < c.sold + c.held)
            return fail(
              409,
              'CONFLICT',
              `Capacity cannot be below the ${c.sold + c.held} seats already taken`,
              'capacity',
            );
          if (i.status === 'DRAFT' && c.sold > 0)
            return fail(
              409,
              'CONFLICT',
              'Tickets are already sold; cancel the event instead of unpublishing',
            );
          Object.assign(
            e,
            { startsAt, endsAt },
            Object.fromEntries(
              Object.entries(i).filter(
                ([k, v]) => v !== undefined && !['startsAt', 'endsAt'].includes(k),
              ),
            ),
          );
          if (i.status === 'CANCELLED') {
            for (const b of bookings.filter((x) => x.eventId === e.id)) {
              if (b.status === 'PAID') b.needsRefund = true;
              if (b.status === 'PENDING') {
                b.status = 'CANCELLED';
                b.holdExpiresAt = null;
              }
            }
            for (const t of tickets.filter((x) => x.eventId === e.id)) t.state = 'VOID';
          }
          return eventDto(e);
        }),
    },

    bookings: {
      list: (eventId) =>
        call(() =>
          ownBookingIds(requireRole('OWNER', 'ORGANISER'))
            .filter((b) => !eventId || b.eventId === eventId)
            .sort((a, b) => +b.createdAt - +a.createdAt)
            .map(bookingDto),
        ),
    },

    staff: {
      list: () =>
        call(() => {
          const u = requireRole('OWNER', 'ORGANISER');
          return users
            .filter(
              (x) =>
                x.role === 'GATE_STAFF' && (u.role === 'OWNER' || x.organiserId === u.organiserId),
            )
            .map(userDto);
        }),
      create: (input) =>
        call(() => {
          const u = requireRole('OWNER', 'ORGANISER');
          const i = parse(createStaffSchema, input);
          if (
            users.some(
              (x) => x.phone === i.phone || (i.email && x.email?.toLowerCase() === i.email),
            )
          )
            return fail(409, 'CONFLICT', 'A user with this phone or email already exists', 'phone');
          const s: User = {
            id: uid(),
            name: i.name,
            phone: i.phone,
            email: i.email,
            password: i.password,
            role: 'GATE_STAFF',
            organiserId: u.organiserId,
            active: true,
          };
          users.push(s);
          return userDto(s);
        }),
      setActive: (id, active) =>
        call(() => {
          const u = requireRole('OWNER', 'ORGANISER');
          const s =
            users.find((x) => x.id === id && x.role === 'GATE_STAFF') ?? notFound('Staff member');
          if (u.role !== 'OWNER' && s.organiserId !== u.organiserId) return forbidden();
          s.active = active;
          return userDto(s);
        }),
    },

    whatsapp: {
      // Demo: connecting shows a QR for a few seconds, then "connects" a fake number. Nothing is sent.
      status: () => call(() => waStatus(requireRole('OWNER', 'ORGANISER'))),
      connect: () =>
        call(() => {
          const u = requireRole('OWNER', 'ORGANISER');
          waLinks.set(waKey(u), { since: Date.now(), connected: false });
          return waStatus(u);
        }),
      disconnect: () =>
        call(() => {
          const u = requireRole('OWNER', 'ORGANISER');
          waLinks.delete(waKey(u));
          return waStatus(u);
        }),
      sendTest: (phone) =>
        call(() => {
          const u = requireRole('OWNER', 'ORGANISER');
          if (!waStatus(u).phone)
            return fail(409, 'CONFLICT', 'Connect your WhatsApp number first');
          if (!/^[6-9]\d{9}$/.test(phone))
            return fail(400, 'VALIDATION', 'Enter a valid 10-digit mobile number', 'phone');
        }),
    },

    messages: {
      list: () =>
        call(() => {
          const ids = new Set(ownBookingIds(requireRole('OWNER', 'ORGANISER')).map((b) => b.id));
          return messages
            .filter((m) => ids.has(m.bookingId))
            .sort((a, b) => +b.createdAt - +a.createdAt)
            .map(msgDto);
        }),
      resend: (id) =>
        call(() => {
          const ids = new Set(ownBookingIds(requireRole('OWNER', 'ORGANISER')).map((b) => b.id));
          const m =
            messages.find((x) => x.id === id && ids.has(x.bookingId)) ?? notFound('Message');
          if (m.status === 'FAILED' || m.status === 'SENT')
            Object.assign(m, {
              status: 'QUEUED',
              attempts: 0,
              nextAttemptAt: now(),
              lastError: null,
            });
          drainOutbox();
          return msgDto(m);
        }),
    },

    gate: {
      events: () =>
        call(() => {
          const scope = gateScope(currentUser());
          return events
            .filter((e) => e.status === 'PUBLISHED' && (!scope || e.organiserId === scope))
            .map(eventDto);
        }),
      scan: (input) =>
        call(() => {
          const u = currentUser();
          const { code: raw, mode, eventId } = parse(scanSchema, input);
          const code = extractTicketCode(raw);
          const ticket = code ? tickets.find((t) => t.code === code) : undefined;
          const scope = gateScope(u);
          const ev = ticket ? events.find((e) => e.id === ticket.eventId) : undefined;
          const visible = ticket && ev && (!scope || ev.organiserId === scope);
          const respond = (reason: ScanRejection | null) => {
            scans.push({
              id: uid(),
              eventId: visible ? ev.id : null,
              ticketId: visible ? ticket.id : null,
              code: code ?? raw.slice(0, 64),
              mode,
              ok: reason === null,
              reason,
              userId: u.id,
              createdAt: now(),
            });
            return {
              ok: reason === null,
              mode,
              code: code ?? raw,
              reason,
              message: reason
                ? SCAN_REJECTION_MESSAGES[reason]
                : mode === 'ENTRY'
                  ? 'Entry allowed'
                  : 'Exit recorded',
              attendeeName: visible ? ticket.attendeeName : null,
              eventTitle: visible ? ev.title : null,
              inside: visible
                ? tickets.filter((t) => t.eventId === ev.id && t.state === 'INSIDE').length
                : null,
            };
          };
          if (!visible) return respond('NOT_FOUND');
          if (eventId && ticket.eventId !== eventId) return respond('WRONG_EVENT');
          if (ev.status !== 'PUBLISHED') return respond('EVENT_NOT_ACTIVE');
          const decision = decideScan(ticket.state, mode);
          if (!decision.ok) return respond(decision.reason);
          ticket.state = decision.next;
          return respond(null);
        }),
      recent: (eventId) =>
        call((): ScanLogDto[] => {
          const u = currentUser();
          const scope = gateScope(u);
          const e = events.find((x) => x.id === eventId);
          if (!e || (scope && e.organiserId !== scope)) return notFound('Event');
          return scans
            .filter((s) => s.eventId === eventId)
            .slice(-25)
            .reverse()
            .map((s) => ({
              id: s.id,
              code: s.code,
              mode: s.mode,
              ok: s.ok,
              reason: s.reason,
              attendeeName: tickets.find((t) => t.id === s.ticketId)?.attendeeName ?? null,
              scannedBy: users.find((x) => x.id === s.userId)?.name ?? '',
              createdAt: s.createdAt.toISOString(),
            }));
        }),
    },

    public: {
      events: () =>
        call(() =>
          events
            .filter((e) => e.status === 'PUBLISHED')
            .map(publicEventDto)
            .filter((e) => e.open),
        ),
      event: (id) =>
        call(() => {
          const e = events.find((x) => x.id === id);
          return !e || e.status === 'DRAFT' ? notFound('Event') : publicEventDto(e);
        }),
      book: (eventId, input) =>
        call(() => {
          const i = parse(createBookingSchema, input);
          const e = events.find((x) => x.id === eventId);
          if (!e || !isEventOpen(e.status, e.startsAt, e.endsAt, now())) return notFound('Event');
          const c = counts(e);
          const remaining = seatsRemaining(e.capacity, c.sold, c.held);
          if (i.quantity > remaining)
            return fail(
              409,
              'SOLD_OUT',
              remaining === 0 ? 'Sold out' : `Only ${remaining} ticket(s) left`,
              'quantity',
            );
          const amount = bookingTotal(e.pricePaise, i.quantity);
          const b: Bk = {
            id: uid(),
            eventId: e.id,
            customerName: i.customerName,
            customerPhone: i.customerPhone,
            quantity: i.quantity,
            attendeeNames: i.attendeeNames,
            amountPaise: amount,
            status: amount === 0 ? 'PAID' : 'PENDING',
            holdExpiresAt: amount === 0 ? null : holdExpiresAt(now()),
            accessToken: token(),
            platformFeePaise: 0,
            organiserSharePaise: 0,
            needsRefund: false,
            paidAt: null,
            createdAt: now(),
          };
          bookings.push(b);
          if (amount === 0) {
            fulfil(e, b);
            return { booking: bookingDto(b), payment: null, accessToken: b.accessToken };
          }
          const orderId = `order_mock_${token().slice(0, 12)}`;
          payments.push({ orderId, bookingId: b.id, amountPaise: amount, captured: false });
          return {
            booking: bookingDto(b),
            payment: { provider: 'mock' as const, orderId, amountPaise: amount, keyId: null },
            accessToken: b.accessToken,
          };
        }),
      booking: (id, t) => call(() => publicBooking(id, t)),
      confirm: (id, t, input) =>
        call(() => {
          const i = parse(confirmPaymentSchema, input);
          publicBooking(id, t);
          const pay = payments.find((p) => p.orderId === i.providerOrderId);
          if (!pay || pay.bookingId !== id)
            return fail(400, 'VALIDATION', 'Order does not belong to this booking');
          if (!i.signature.startsWith('sig_mock_'))
            return fail(400, 'PAYMENT_FAILED', 'Payment could not be verified');
          settle(pay.orderId);
          return publicBooking(id, t);
        }),
      ticket: (raw) =>
        call(() => {
          const code = extractTicketCode(raw);
          const t = code ? tickets.find((x) => x.code === code) : undefined;
          if (!t) return notFound('Ticket');
          const e = byId(events, t.eventId, 'Event');
          return {
            ticket: { id: t.id, code: t.code, attendeeName: t.attendeeName, state: t.state },
            eventTitle: e.title,
            venue: e.venue,
            startsAt: e.startsAt.toISOString(),
          };
        }),
      mockPay: (orderId) =>
        call(() => ({
          providerOrderId: orderId,
          providerPaymentId: `pay_mock_${token().slice(0, 10)}`,
          signature: `sig_mock_${token().slice(0, 10)}`,
        })),
    },
  };

  const demo: DemoControls = {
    personas: [
      { label: 'Owner', login: '7498605559', role: 'OWNER' },
      { label: 'Organiser', login: '9000000001', role: 'ORGANISER' },
      { label: 'Gate staff', login: '9000000002', role: 'GATE_STAFF' },
    ],
    advanceMinutes: (m) => {
      offset += m * 60_000;
      drainOutbox();
      changed();
    },
    setWhatsAppFailing: (f) => {
      failingWhatsApp = f;
      changed();
    },
    isWhatsAppFailing: () => failingWhatsApp,
    ticketCodes: (eventId) =>
      tickets
        .filter((t) => !eventId || t.eventId === eventId)
        .map((t) => ({
          code: t.code,
          attendeeName: t.attendeeName,
          state: t.state,
          eventId: t.eventId,
        })),
    publicEventId: () => live.id,
    subscribe: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  return { api, demo };
}
