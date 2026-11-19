export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SOLD_OUT'
  | 'RATE_LIMITED'
  | 'PAYMENT_FAILED'
  | 'UPSTREAM'
  | 'INTERNAL';

/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, field?: string) =>
  new AppError(400, 'VALIDATION', message, field);
export const unauthenticated = (message = 'Please sign in') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have access to this') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, field?: string) =>
  new AppError(409, 'CONFLICT', message, field);
