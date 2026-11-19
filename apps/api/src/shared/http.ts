import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { z, ZodError } from 'zod';
import { AppError, badRequest, notFound } from './errors';

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw zodToAppError(result.error);
}

function zodToAppError(error: ZodError): AppError {
  const issue = error.issues[0];
  const field = issue?.path.join('.') || undefined;
  return badRequest(issue?.message ?? 'Invalid input', field);
}

const uuid = z.string().uuid();

/** Reads a UUID route param; a malformed id can never match a row, so it is a 404. */
export function idParam(req: Request, name = 'id'): string {
  const parsed = uuid.safeParse(req.params[name]);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

/** Blocks cross-site form posts: browsers cannot add this header without a CORS preflight. */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (!safe && req.get('x-requested-with') !== 'fetch') {
    next(new AppError(403, 'FORBIDDEN', 'Missing request header'));
    return;
  }
  next();
};

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound('Route'));

export function createErrorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const appError =
      err instanceof AppError ? err : err instanceof ZodError ? zodToAppError(err) : null;
    if (appError) {
      res.status(appError.status).json({
        error: { code: appError.code, message: appError.message, field: appError.field },
      });
      return;
    }
    if (isBodyParserError(err)) {
      res.status(400).json({ error: { code: 'VALIDATION', message: 'Malformed request body' } });
      return;
    }
    log.error({ err, method: req.method, url: req.originalUrl }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  };
}

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    String((err as { type: unknown }).type).startsWith('entity.')
  );
}
