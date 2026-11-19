export type MessageTemplateName = 'BOOKING_CONFIRMED';

export const MESSAGE_TEMPLATES: Record<MessageTemplateName, string> = {
  BOOKING_CONFIRMED:
    'Hi {{name}}, your booking for *{{event}}* is confirmed ✅\n' +
    '{{quantity}} ticket(s) · {{amount}}\n' +
    '{{when}} · {{venue}}\n\n' +
    'Your tickets (show the QR at the gate): {{link}}',
};

export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''));
}
