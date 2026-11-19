import type { ScanMode, TicketState } from './constants';
import { TICKET_CODE_ALPHABET, TICKET_CODE_LENGTH } from './constants';

export type ScanRejection =
  | 'NOT_FOUND'
  | 'WRONG_EVENT'
  | 'EVENT_NOT_ACTIVE'
  | 'VOID'
  | 'ALREADY_INSIDE'
  | 'NEVER_ENTERED'
  | 'ALREADY_EXITED';

export const SCAN_REJECTION_MESSAGES: Record<ScanRejection, string> = {
  NOT_FOUND: 'Ticket not found',
  WRONG_EVENT: 'Ticket is for a different event',
  EVENT_NOT_ACTIVE: 'Event is not open for entry',
  VOID: 'Ticket is cancelled',
  ALREADY_INSIDE: 'Already inside — scan at exit first',
  NEVER_ENTERED: 'Never entered — scan at entry first',
  ALREADY_EXITED: 'Already exited — scan at entry to re-enter',
};

export type ScanDecision = { ok: true; next: TicketState } | { ok: false; reason: ScanRejection };

/** The gate state machine. ISSUED/EXITED -> INSIDE on entry; INSIDE -> EXITED on exit. */
export function decideScan(state: TicketState, mode: ScanMode): ScanDecision {
  if (state === 'VOID') return { ok: false, reason: 'VOID' };
  if (mode === 'ENTRY') {
    return state === 'INSIDE'
      ? { ok: false, reason: 'ALREADY_INSIDE' }
      : { ok: true, next: 'INSIDE' };
  }
  if (state === 'INSIDE') return { ok: true, next: 'EXITED' };
  return { ok: false, reason: state === 'ISSUED' ? 'NEVER_ENTERED' : 'ALREADY_EXITED' };
}

/** The state a ticket must currently be in for a scan in `mode` to be applied (used for atomic updates). */
export function expectedStatesFor(mode: ScanMode): TicketState[] {
  return mode === 'ENTRY' ? ['ISSUED', 'EXITED'] : ['INSIDE'];
}

const CODE_PATTERN = new RegExp(`^[${TICKET_CODE_ALPHABET}]{${TICKET_CODE_LENGTH}}$`);

/** Accepts a bare code or a full ticket URL (QR content); returns a normalised code or null. */
export function extractTicketCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const path = trimmed.split(/[?#]/)[0] ?? '';
  const last = path.split('/').filter(Boolean).pop() ?? '';
  const code = last.toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** `randomInt(max)` must return a uniformly random integer in [0, max). */
export function generateTicketCode(randomInt: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < TICKET_CODE_LENGTH; i += 1) {
    code += TICKET_CODE_ALPHABET.charAt(randomInt(TICKET_CODE_ALPHABET.length));
  }
  return code;
}

export const ticketUrl = (webUrl: string, code: string): string =>
  `${webUrl.replace(/\/$/, '')}/t/${code}`;
