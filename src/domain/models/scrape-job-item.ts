// Scrape Job Item — per-URL state machine inside a scrape_jobs row.
//
// Drives the per-URL progress UI and the Supabase Realtime push channel.
// One row per URL in a scrape job, tracking which pipeline stage the URL
// is currently in, plus per-stage metadata (download bytes, duration,
// error message). Ordered within a job by `ordinal`.

export type ScrapeJobItemStage =
  | 'queued'
  | 'discovering'
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'done'
  | 'failed';

export interface ScrapeJobItem {
  id: string;
  jobId: string;
  url: string;
  title: string | null;
  ordinal: number;
  stage: ScrapeJobItemStage;
  bytesDownloaded: number | null;
  bytesTotal: number | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
}

/**
 * Partial metadata emitted alongside a stage transition.
 *
 * Not every stage carries the same fields:
 *  - `downloading` emits `bytesDownloaded` (and sometimes `bytesTotal`)
 *  - `done` may emit `durationSeconds`
 *  - `failed` emits `errorMessage`
 *
 * All fields are optional so callers can pass only what they know.
 */
export interface ScrapeStageMeta {
  bytesDownloaded?: number;
  bytesTotal?: number;
  durationSeconds?: number;
  errorMessage?: string;
  title?: string;
}

/**
 * The subset of stages that are "terminal" — no further transitions expected.
 */
export const TERMINAL_STAGES: readonly ScrapeJobItemStage[] = ['done', 'failed'] as const;

export function isTerminalStage(stage: ScrapeJobItemStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}
