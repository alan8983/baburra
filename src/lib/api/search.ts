/**
 * Escape special characters for PostgREST filter syntax.
 * Without this, user input like "test,id.eq.1" can inject additional filter clauses.
 */
export function escapePostgrestSearch(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\') // backslash first
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\./g, '\\.');
}
