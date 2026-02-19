import { NextResponse } from 'next/server';

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

  return NextResponse.json({ error: clientMessage }, { status: 500 });
}
