// Scrape Job Item Repository — CRUD for per-URL progress rows.
//
// Mirrors the scrape_job.repository pattern: service-role admin client,
// snake_case DB rows mapped to camelCase domain objects.

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { ScrapeJobItem, ScrapeJobItemStage, ScrapeStageMeta } from '@/domain/models';

type DbScrapeJobItem = {
  id: string;
  job_id: string;
  url: string;
  title: string | null;
  ordinal: number;
  stage: string;
  bytes_downloaded: number | null;
  bytes_total: number | null;
  duration_seconds: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

function mapRow(row: DbScrapeJobItem): ScrapeJobItem {
  return {
    id: row.id,
    jobId: row.job_id,
    url: row.url,
    title: row.title,
    ordinal: row.ordinal,
    stage: row.stage as ScrapeJobItemStage,
    bytesDownloaded: row.bytes_downloaded,
    bytesTotal: row.bytes_total,
    durationSeconds: row.duration_seconds,
    errorMessage: row.error_message,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    updatedAt: new Date(row.updated_at),
  };
}

export interface NewScrapeJobItemInput {
  url: string;
  title?: string | null;
}

/**
 * Seed one item row per URL for a freshly-created scrape job. Returns the
 * created rows in ordinal order so the caller can keep a URL→itemId map.
 */
export async function createScrapeJobItems(
  jobId: string,
  items: NewScrapeJobItemInput[]
): Promise<ScrapeJobItem[]> {
  if (items.length === 0) return [];

  const supabase = createAdminClient();
  const rows = items.map((item, ordinal) => ({
    job_id: jobId,
    url: item.url,
    title: item.title ?? null,
    ordinal,
    stage: 'queued',
  }));

  const { data, error } = await supabase
    .from('scrape_job_items')
    .insert(rows)
    .select('*')
    .order('ordinal', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as DbScrapeJobItem[]).map(mapRow);
}

/**
 * Fetch every item row for a job, ordered by ordinal ascending.
 */
export async function getScrapeJobItems(jobId: string): Promise<ScrapeJobItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('scrape_job_items')
    .select('*')
    .eq('job_id', jobId)
    .order('ordinal', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as DbScrapeJobItem[]).map(mapRow);
}

/**
 * Update an item's stage and (optionally) any stage metadata.
 *
 * The caller decides which fields to set — we only write what's supplied
 * so partial updates stay partial. `started_at` is set the first time an
 * item leaves the `queued` stage; `finished_at` is set when it reaches a
 * terminal stage.
 */
export async function updateScrapeJobItemStage(
  itemId: string,
  stage: ScrapeJobItemStage,
  meta?: ScrapeStageMeta
): Promise<void> {
  const supabase = createAdminClient();
  const updates: Record<string, unknown> = { stage };

  if (meta?.bytesDownloaded !== undefined) updates.bytes_downloaded = meta.bytesDownloaded;
  if (meta?.bytesTotal !== undefined) updates.bytes_total = meta.bytesTotal;
  if (meta?.durationSeconds !== undefined) updates.duration_seconds = meta.durationSeconds;
  if (meta?.errorMessage !== undefined) updates.error_message = meta.errorMessage;
  if (meta?.title !== undefined) updates.title = meta.title;

  // started_at fires on the first transition out of 'queued'. We use COALESCE
  // semantics by only setting it when the new stage is non-queued; the DB
  // column is nullable so subsequent updates never overwrite it.
  if (stage !== 'queued') {
    updates.started_at_if_null = true; // sentinel handled below
  }
  if (stage === 'done' || stage === 'failed') {
    updates.finished_at = new Date().toISOString();
  }

  // Translate the sentinel into a COALESCE-style behavior: we first read the
  // existing started_at, only update if null. Keeping this client-side keeps
  // the SQL simple.
  if (updates.started_at_if_null) {
    delete updates.started_at_if_null;
    const { data: existing } = await supabase
      .from('scrape_job_items')
      .select('started_at')
      .eq('id', itemId)
      .maybeSingle();
    if (existing && (existing as { started_at: string | null }).started_at === null) {
      updates.started_at = new Date().toISOString();
    }
  }

  const { error } = await supabase.from('scrape_job_items').update(updates).eq('id', itemId);
  if (error) throw new Error(error.message);
}

/**
 * Convenience helper: mark an item as failed with a message and timestamp.
 * Equivalent to `updateScrapeJobItemStage(itemId, 'failed', { errorMessage })`.
 */
export async function failScrapeJobItem(itemId: string, errorMessage: string): Promise<void> {
  return updateScrapeJobItemStage(itemId, 'failed', { errorMessage });
}

/**
 * Best-effort bulk update of the download-bytes counter without touching
 * the stage. Used by the streaming download progress reporter at ~1 MB
 * increments — we don't want to churn the whole row state on every chunk.
 */
export async function updateScrapeJobItemDownloadProgress(
  itemId: string,
  bytesDownloaded: number,
  bytesTotal?: number
): Promise<void> {
  const supabase = createAdminClient();
  const updates: Record<string, unknown> = { bytes_downloaded: bytesDownloaded };
  if (bytesTotal !== undefined) updates.bytes_total = bytesTotal;
  const { error } = await supabase.from('scrape_job_items').update(updates).eq('id', itemId);
  if (error) throw new Error(error.message);
}
