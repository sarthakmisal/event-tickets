import { describe, expect, it } from 'vitest';
import {
  createBookingSchema,
  decideScan,
  extractTicketCode,
  generateTicketCode,
  phoneSchema,
  renderTemplate,
  seatsRemaining,
  splitCommission,
} from './index';

describe('splitCommission', () => {
  it('splits by basis points and always sums to the amount', () => {
    expect(splitCommission(50_000, 1_000)).toEqual({
      platformFeePaise: 5_000,
      organiserSharePaise: 45_000,
    });
    const odd = splitCommission(33_333, 750);
    expect(odd.platformFeePaise + odd.organiserSharePaise).toBe(33_333);
  });
  it('handles zero commission and free tickets', () => {
    expect(splitCommission(10_000, 0).platformFeePaise).toBe(0);
    expect(splitCommission(0, 1_000)).toEqual({ platformFeePaise: 0, organiserSharePaise: 0 });
  });
});

describe('decideScan', () => {
  it('allows entry from ISSUED and EXITED, rejects when already inside', () => {
    expect(decideScan('ISSUED', 'ENTRY')).toEqual({ ok: true, next: 'INSIDE' });
    expect(decideScan('EXITED', 'ENTRY')).toEqual({ ok: true, next: 'INSIDE' });
    expect(decideScan('INSIDE', 'ENTRY')).toEqual({ ok: false, reason: 'ALREADY_INSIDE' });
  });
  it('allows exit only from INSIDE', () => {
    expect(decideScan('INSIDE', 'EXIT')).toEqual({ ok: true, next: 'EXITED' });
    expect(decideScan('ISSUED', 'EXIT')).toEqual({ ok: false, reason: 'NEVER_ENTERED' });
    expect(decideScan('EXITED', 'EXIT')).toEqual({ ok: false, reason: 'ALREADY_EXITED' });
  });
  it('rejects void tickets in both modes', () => {
    expect(decideScan('VOID', 'ENTRY')).toEqual({ ok: false, reason: 'VOID' });
    expect(decideScan('VOID', 'EXIT')).toEqual({ ok: false, reason: 'VOID' });
  });
});

describe('ticket codes', () => {
  it('generates valid codes that round-trip through extractTicketCode', () => {
    const code = generateTicketCode((max) => Math.floor(Math.random() * max));
    expect(code).toHaveLength(10);
    expect(extractTicketCode(code)).toBe(code);
    expect(extractTicketCode(`https://x.app/t/${code.toLowerCase()}?x=1`)).toBe(code);
  });
  it('rejects junk', () => {
    expect(extractTicketCode('')).toBeNull();
    expect(extractTicketCode('hello')).toBeNull();
    expect(extractTicketCode('ILOU000000')).toBeNull();
  });
});

describe('capacity', () => {
  it('never goes negative', () => {
    expect(seatsRemaining(10, 6, 3)).toBe(1);
    expect(seatsRemaining(10, 8, 5)).toBe(0);
  });
});

describe('schemas', () => {
  it('normalises Indian phone numbers', () => {
    expect(phoneSchema.parse('+91 74986 05559')).toBe('7498605559');
    expect(phoneSchema.parse('07498605559')).toBe('7498605559');
    expect(phoneSchema.safeParse('12345').success).toBe(false);
  });
  it('rejects more attendee names than tickets', () => {
    const r = createBookingSchema.safeParse({
      customerName: 'Asha',
      customerPhone: '9876543210',
      quantity: 1,
      attendeeNames: ['A', 'B'],
    });
    expect(r.success).toBe(false);
  });
});

describe('renderTemplate', () => {
  it('fills placeholders and blanks unknown ones', () => {
    expect(renderTemplate('Hi {{a}} {{b}}', { a: 'x' })).toBe('Hi x ');
  });
});
