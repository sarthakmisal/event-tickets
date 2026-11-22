import type {
  BookingDto,
  CreatedBookingDto,
  DashboardDto,
  EventDto,
  MessageDto,
  OrganiserDto,
  PublicBookingDto,
  PublicEventDto,
  ScanLogDto,
  ScanResultDto,
  TicketViewDto,
  UserDto,
  WhatsAppStatusDto,
} from '@et/shared';
import { ApiError } from './types';
import type { Api, MockPayment } from './types';

type ErrorBody = { error?: { code: string; message: string; field?: string } };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'fetch',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your connection.', undefined, 0);
  }
  const data = (await res.json().catch(() => null)) as (T & ErrorBody) | null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(
      e?.code ?? 'INTERNAL',
      e?.message ?? 'Something went wrong',
      e?.field,
      res.status,
    );
  }
  return data as T;
}

const get = <T>(url: string) => request<T>('GET', url);
const post = <T>(url: string, body: unknown = {}) => request<T>('POST', url, body);
const patch = <T>(url: string, body: unknown) => request<T>('PATCH', url, body);
const token = (t: string) => `t=${encodeURIComponent(t)}`;

export function createHttpApi(): Api {
  return {
    auth: {
      login: async (input) => (await post<{ user: UserDto }>('/api/auth/login', input)).user,
      logout: async () => {
        await post('/api/auth/logout');
      },
      me: async () => {
        try {
          return (await get<{ user: UserDto }>('/api/auth/me')).user;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) return null;
          throw e;
        }
      },
    },
    dashboard: {
      get: async () => (await get<{ dashboard: DashboardDto }>('/api/dashboard')).dashboard,
    },
    organisers: {
      list: async () => (await get<{ organisers: OrganiserDto[] }>('/api/organisers')).organisers,
      create: async (i) =>
        (await post<{ organiser: OrganiserDto }>('/api/organisers', i)).organiser,
      update: async (id, i) =>
        (await patch<{ organiser: OrganiserDto }>(`/api/organisers/${id}`, i)).organiser,
    },
    events: {
      list: async () => (await get<{ events: EventDto[] }>('/api/events')).events,
      get: async (id) => (await get<{ event: EventDto }>(`/api/events/${id}`)).event,
      create: async (i) => (await post<{ event: EventDto }>('/api/events', i)).event,
      update: async (id, i) => (await patch<{ event: EventDto }>(`/api/events/${id}`, i)).event,
    },
    bookings: {
      list: async (eventId) =>
        (
          await get<{ bookings: BookingDto[] }>(
            `/api/bookings${eventId ? `?eventId=${eventId}` : ''}`,
          )
        ).bookings,
    },
    staff: {
      list: async () => (await get<{ staff: UserDto[] }>('/api/staff')).staff,
      create: async (i) => (await post<{ staff: UserDto }>('/api/staff', i)).staff,
      setActive: async (id, active) =>
        (await patch<{ staff: UserDto }>(`/api/staff/${id}`, { active })).staff,
    },
    messages: {
      list: async () => (await get<{ messages: MessageDto[] }>('/api/messages')).messages,
      resend: async (id) =>
        (await post<{ message: MessageDto }>(`/api/messages/${id}/resend`)).message,
    },
    whatsapp: {
      status: async () => (await get<{ whatsapp: WhatsAppStatusDto }>('/api/whatsapp')).whatsapp,
      connect: async () =>
        (await post<{ whatsapp: WhatsAppStatusDto }>('/api/whatsapp/connect')).whatsapp,
      disconnect: async () =>
        (await post<{ whatsapp: WhatsAppStatusDto }>('/api/whatsapp/disconnect')).whatsapp,
      sendTest: async (phone) => {
        await post('/api/whatsapp/test', { phone });
      },
    },
    gate: {
      events: async () => (await get<{ events: EventDto[] }>('/api/gate/events')).events,
      scan: async (i) => (await post<{ result: ScanResultDto }>('/api/gate/scan', i)).result,
      recent: async (id) =>
        (await get<{ scans: ScanLogDto[] }>(`/api/gate/events/${id}/scans`)).scans,
    },
    public: {
      events: async () => (await get<{ events: PublicEventDto[] }>('/api/public/events')).events,
      event: async (id) => (await get<{ event: PublicEventDto }>(`/api/public/events/${id}`)).event,
      book: (eventId, i) => post<CreatedBookingDto>(`/api/public/events/${eventId}/bookings`, i),
      booking: (id, t) => get<PublicBookingDto>(`/api/public/bookings/${id}?${token(t)}`),
      confirm: (id, t, i) =>
        post<PublicBookingDto>(`/api/public/bookings/${id}/confirm?${token(t)}`, i),
      ticket: (code) => get<TicketViewDto>(`/api/public/tickets/${encodeURIComponent(code)}`),
      mockPay: (orderId) => post<MockPayment>('/api/public/dev/mock-pay', { orderId }),
    },
  };
}
