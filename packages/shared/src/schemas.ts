import { z } from 'zod';
import { MAX_COMMISSION_BPS, MAX_TICKETS_PER_BOOKING, SCAN_MODES } from './constants';

/** Indian mobile number; accepts +91 / 0 prefixes and spaces, normalises to 10 digits. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number');

const name = z.string().trim().min(2, 'Too short').max(80, 'Too long');
const email = z.string().trim().toLowerCase().email('Enter a valid email');
const password = z.string().min(8, 'At least 8 characters').max(128);
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const loginSchema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const createOrganiserSchema = z.object({
  name,
  phone: phoneSchema,
  email,
  password,
  commissionBps: z.number().int().min(0).max(MAX_COMMISSION_BPS),
});

export const updateOrganiserSchema = z
  .object({ commissionBps: z.number().int().min(0).max(MAX_COMMISSION_BPS), active: z.boolean() })
  .partial();

const eventFields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).default(''),
  venue: z.string().trim().min(2).max(160),
  startsAt: isoDate,
  endsAt: isoDate.nullable().default(null),
  pricePaise: z.number().int().min(0).max(10_000_000),
  capacity: z.number().int().min(1).max(100_000),
};

export const createEventSchema = z
  .object(eventFields)
  .refine((e) => e.endsAt === null || Date.parse(e.endsAt) > Date.parse(e.startsAt), {
    message: 'End must be after start',
    path: ['endsAt'],
  });

export const updateEventSchema = z
  .object({
    ...eventFields,
    status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']),
  })
  .partial();

export const createStaffSchema = z.object({
  name,
  phone: phoneSchema,
  email: email.nullable().default(null),
  password,
});

export const createBookingSchema = z
  .object({
    customerName: name,
    customerPhone: phoneSchema,
    quantity: z.number().int().min(1).max(MAX_TICKETS_PER_BOOKING),
    attendeeNames: z.array(z.string().trim().max(80)).max(MAX_TICKETS_PER_BOOKING).default([]),
  })
  .refine((b) => b.attendeeNames.length <= b.quantity, {
    message: 'More attendee names than tickets',
    path: ['attendeeNames'],
  });

export const confirmPaymentSchema = z.object({
  providerOrderId: z.string().min(1).max(100),
  providerPaymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
});

export const scanSchema = z.object({
  code: z.string().trim().min(1).max(300),
  mode: z.enum(SCAN_MODES),
  eventId: z.string().uuid().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrganiserInput = z.infer<typeof createOrganiserSchema>;
export type UpdateOrganiserInput = z.infer<typeof updateOrganiserSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
export type ScanInput = z.infer<typeof scanSchema>;
