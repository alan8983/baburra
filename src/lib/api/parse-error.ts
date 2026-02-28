/**
 * Parse an API error response body into a human-readable message.
 * Handles both legacy `{ error: string }` and standard `{ error: { code, message } }` shapes.
 */
export function parseApiError(json: unknown, fallback = 'An unexpected error occurred'): string {
  if (typeof json === 'object' && json !== null && 'error' in json) {
    const err = (json as { error: unknown }).error;
    if (typeof err === 'string') return err;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return (err as { message: string }).message;
    }
  }
  return fallback;
}

/**
 * Extract the error code from an API error response, if available.
 */
export function parseApiErrorCode(json: unknown): string | null {
  if (typeof json === 'object' && json !== null && 'error' in json) {
    const err = (json as { error: unknown }).error;
    if (typeof err === 'object' && err !== null && 'code' in err) {
      return (err as { code: string }).code;
    }
  }
  return null;
}
