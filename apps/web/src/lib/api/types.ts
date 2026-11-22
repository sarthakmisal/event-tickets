import type {
  BookingDto,
  ConfirmPaymentInput,
  CreateBookingInput,
  CreatedBookingDto,
  CreateEventInput,
  CreateOrganiserInput,
  CreateStaffInput,
  DashboardDto,
  EventDto,
  LoginInput,
  MessageDto,
  OrganiserDto,
  PublicBookingDto,
  PublicEventDto,
  ScanInput,
  ScanLogDto,
  ScanResultDto,
  TicketViewDto,
  UpdateEventInput,
  UpdateOrganiserInput,
  UserDto,
  WhatsAppStatusDto,
} from '@et/shared';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface MockPayment {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

/**
 * Everything the UI needs from a backend. Two implementations: `http` (the real API) and
 * `memory` (the in-browser demo that enforces the same business rules without a database).
 */
export interface Api {
  auth: {
    login(input: LoginInput): Promise<UserDto>;
    logout(): Promise<void>;
    me(): Promise<UserDto | null>;
  };
  dashboard: { get(): Promise<DashboardDto> };
  organisers: {
    list(): Promise<OrganiserDto[]>;
    create(input: CreateOrganiserInput): Promise<OrganiserDto>;
    update(id: string, input: UpdateOrganiserInput): Promise<OrganiserDto>;
  };
  events: {
    list(): Promise<EventDto[]>;
    get(id: string): Promise<EventDto>;
    create(input: CreateEventInput): Promise<EventDto>;
    update(id: string, input: UpdateEventInput): Promise<EventDto>;
  };
  bookings: { list(eventId?: string): Promise<BookingDto[]> };
  staff: {
    list(): Promise<UserDto[]>;
    create(input: CreateStaffInput): Promise<UserDto>;
    setActive(id: string, active: boolean): Promise<UserDto>;
  };
  messages: { list(): Promise<MessageDto[]>; resend(id: string): Promise<MessageDto> };
  /** Link a WhatsApp number by scanning a QR (the owner's number for the platform, an organiser's own). */
  whatsapp: {
    status(): Promise<WhatsAppStatusDto>;
    connect(): Promise<WhatsAppStatusDto>;
    disconnect(): Promise<WhatsAppStatusDto>;
    sendTest(phone: string): Promise<void>;
  };
  gate: {
    events(): Promise<EventDto[]>;
    scan(input: ScanInput): Promise<ScanResultDto>;
    recent(eventId: string): Promise<ScanLogDto[]>;
  };
  public: {
    events(): Promise<PublicEventDto[]>;
    event(id: string): Promise<PublicEventDto>;
    book(eventId: string, input: CreateBookingInput): Promise<CreatedBookingDto>;
    booking(id: string, token: string): Promise<PublicBookingDto>;
    confirm(id: string, token: string, input: ConfirmPaymentInput): Promise<PublicBookingDto>;
    ticket(code: string): Promise<TicketViewDto>;
    /** Development checkout only (mock payment provider). */
    mockPay(orderId: string): Promise<MockPayment>;
  };
}
