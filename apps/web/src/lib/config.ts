import { ticketUrl } from '@et/shared';

/** Origin used in links and QR codes (the demo runs in a sandbox without a real origin). */
export const WEB_ORIGIN = __DEMO__ ? 'https://tickets.example.com' : window.location.origin;

export const eventLink = (id: string) => `${WEB_ORIGIN}/e/${id}`;
export const ticketLink = (code: string) => ticketUrl(WEB_ORIGIN, code);
