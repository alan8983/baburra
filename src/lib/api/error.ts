import { NextResponse } from 'next/server';
import type { ApiErrorPayload } from './validation';
import { errorResponse } from './validation';

// Re-export for convenience
export { errorResponse };
export type { ApiErrorPayload };

// ─── Convenience helpers ─────────────────────────────────────────

export function unauthorizedError(message = 'Please log in'): NextResponse {
  return errorResponse(401, 'UNAUTHORIZED', message);
}

export function notFoundError(resource = 'Resource'): NextResponse {
  return errorResponse(404, 'NOT_FOUND', `${resource} not found`);
}

export function badRequestError(message: string, code = 'BAD_REQUEST'): NextResponse {
  return errorResponse(400, code, message);
}

export function forbiddenError(message = 'Forbidden'): NextResponse {
  return errorResponse(403, 'FORBIDDEN', message);
}

/**
 * Return a safe 500 error response.
 * In production, internal error details (DB constraints, stack traces) are hidden.
 */
export function internalError(err: unknown, fallbackMessage: string) {
  const detail = err instanceof Error ? err.message : String(err);

  // Always log server-side
  console.error(fallbackMessage, err);

  const clientMessage =
    process.env.NODE_ENV === 'production' ? fallbackMessage : detail || fallbackMessage;

  return errorResponse(500, 'INTERNAL_ERROR', clientMessage);
}
