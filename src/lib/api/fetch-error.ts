import { parseApiError, parseApiErrorCode } from './parse-error';

/**
 * Structured error thrown by client-side fetch helpers.
 * Preserves HTTP status, backend error code, and the human-readable message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, body: unknown) {
    const message = parseApiError(body, `Request failed with status ${status}`);
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = parseApiErrorCode(body);
  }
}

/**
 * Throw an `ApiError` if the response is not OK.
 * Drop-in replacement for `if (!res.ok) throw new Error('...')`.
 */
export async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  throw new ApiError(res.status, body);
}
