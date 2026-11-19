import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 24): string => randomBytes(bytes).toString('base64url');
export const randomIntBelow = (max: number): number => randomInt(max);

export const hmacSha256Hex = (secret: string, payload: string | Buffer): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
