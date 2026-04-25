// Scrape Job Repository — CRUD for scrape_jobs table

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { ScrapeJob, ScrapeJobType } from '@/domain/models';
import { isTerminalStage, type ScrapeJobItemStage } from '@/domain/models';

// ── Terminal-state write resilience (#90 / D3) ──────────────────────────────
//
// Issue #90 surfaced a class of bug where a single transient `fetch failed`
// from Supabase aborts a whole batch's observability — posts commit, but the
// `scrape_jobs` row is stuck in `processing` because the terminal `update()`
// threw out of `processJobBatch`. Two layers of defense:
//
//   1. `retryTerminalWrite` — narrow, network-shaped retry around any one
//      terminal write. Constraint violations etc. still surface immediately.
//   2. `reconcileStuckJob` — if (1) ultimately fails, the next entry into
//      `processJobBatch` for the same job invokes this and self-heals when
//      every per-URL item is terminal.

const TERMINAL_RETRYABLE_PATTERN = /fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i;
const TERMINAL_RETRY_DELAYS_MS = [250, 500, 1000] as const;

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (TERMINAL_RETRYABLE_PATTERN.test(err.message)) return true;
  const status = (err as Error & { status?: number; code?: string | number }).status;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  const code = (err as Error & { code?: string | number }).code;
  if (typeof code === 'string' && /^5\d\d$/.test(code)) return true;
  return false;
}

/**
 * Run a terminal-state write under a narrow retry policy. Up to 4 attempts
 * (1 initial + 3 retries) with exponential backoff at 250 / 500 / 1000ms.
 * Retries only on network-shaped errors (`fetch failed`, `ETIMEDOUT`,
 * `ECONNRESET`, `socket hang up`, or a 5xx PostgREST status). Constraint
 * violations and any other non-network error throw immediately — the goal is
 * to absorb edge flaps, not to mask programmer errors.
 *
 * Exported so call sites outside this repository (e.g. `kol_sources` writes
 * issued from `profile-scrape.service`) can wrap the same way.
 */
export async function retryTerminalWrite<T>(
  fn: () => Promise<T>,
  context: string = 'terminal-write'
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TERMINAL_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableNetworkError(err)) throw err;
      if (attempt === TERMINAL_RETRY_DELAYS_MS.length) break;
      const delay = TERMINAL_RETRY_DELAYS_MS[attempt];
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[scrape-job.repository] terminal write retry ${attempt + 1}/${TERMINAL_RETRY_DELAYS_MS.length} for ${context}: ${message}`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type DbScrapeJob = {
  id: string;
  kol_source_id: string | null;
  job_type: string;
  status: string;
  triggered_by: string | null;
  total_urls: number;
  processed_urls: number;
  imported_count: number;
  duplicate_count: number;
  error_count: number;
  filtered_count: number;
  discovered_urls: string[];
  retry_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapDbToScrapeJob(row: DbScrapeJob): ScrapeJob {
  return {
    id: row.id,
    kolSourceId: row.kol_source_id,
    jobType: row.job_type as ScrapeJob['jobType'],
    status: row.status as ScrapeJob['status'],
    triggeredBy: row.triggered_by,
    totalUrls: row.total_urls,
    processedUrls: row.processed_urls,
    importedCount: row.imported_count,
    duplicateCount: row.duplicate_count,
    errorCount: row.error_count,
    filteredCount: row.filtered_count ?? 0,
    discoveredUrls: row.discovered_urls ?? [],
    retryCount: row.retry_count ?? 0,
    errorMessage: row.error_message,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createScrapeJob(
  sourceId: string | null,
  jobType: ScrapeJobType,
  triggeredBy: string | null,
  discoveredUrls: string[]
): Promise<ScrapeJob> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('scrape_jobs')
    .insert({
      kol_source_id: sourceId,
      job_type: jobType,
      triggered_by: triggeredBy,
      discovered_urls: discoveredUrls,
      total_urls: discoveredUrls.length,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapDbToScrapeJob(row as DbScrapeJob);
}

export async function startScrapeJob(jobId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('scrape_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'queued');

  if (error) throw new Error(error.message);
}

export async function getScrapeJobById(jobId: string): Promise<ScrapeJob | null> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;
  return mapDbToScrapeJob(row as DbScrapeJob);
}

export async function getScrapeJobsByUser(
  userId: string,
  limit: number = 20
): Promise<ScrapeJob[]> {
  const supabase = createAdminClient();

  // Join kol_sources → kols to get KOL name for display
  const { data: rows, error } = await supabase
    .from('scrape_jobs')
    .select('*, kol_sources(kol_id, kols(id, name))')
    .eq('triggered_by', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  type JoinedRow = DbScrapeJob & {
    kol_sources?: { kol_id: string; kols?: { id: string; name: string } | null } | null;
  };

  return (rows as JoinedRow[]).map((row) => {
    const job = mapDbToScrapeJob(row as DbScrapeJob);
    if (row.kol_sources?.kols) {
      job.kolId = row.kol_sources.kols.id;
      job.kolName = row.kol_sources.kols.name;
    }
    return job;
  });
}

export async function getQueuedScrapeJobs(limit: number = 10): Promise<ScrapeJob[]> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .in('status', ['queued', 'processing'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (rows as DbScrapeJob[]).map(mapDbToScrapeJob);
}

export async function updateScrapeJobProgress(
  jobId: string,
  stats: {
    processedUrls?: number;
    importedCount?: number;
    duplicateCount?: number;
    errorCount?: number;
    filteredCount?: number;
  }
): Promise<void> {
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (stats.processedUrls !== undefined) updates.processed_urls = stats.processedUrls;
  if (stats.importedCount !== undefined) updates.imported_count = stats.importedCount;
  if (stats.duplicateCount !== undefined) updates.duplicate_count = stats.duplicateCount;
  if (stats.errorCount !== undefined) updates.error_count = stats.errorCount;
  if (stats.filteredCount !== undefined) updates.filtered_count = stats.filteredCount;

  const { error } = await supabase.from('scrape_jobs').update(updates).eq('id', jobId);

  if (error) throw new Error(error.message);
}

export async function completeScrapeJob(
  jobId: string,
  stats?: {
    processedUrls?: number;
    importedCount?: number;
    duplicateCount?: number;
    errorCount?: number;
    filteredCount?: number;
  }
): Promise<void> {
  return retryTerminalWrite(async () => {
    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
    };

    if (stats) {
      if (stats.processedUrls !== undefined) updates.processed_urls = stats.processedUrls;
      if (stats.importedCount !== undefined) updates.imported_count = stats.importedCount;
      if (stats.duplicateCount !== undefined) updates.duplicate_count = stats.duplicateCount;
      if (stats.errorCount !== undefined) updates.error_count = stats.errorCount;
      if (stats.filteredCount !== undefined) updates.filtered_count = stats.filteredCount;
    }

    const { error } = await supabase.from('scrape_jobs').update(updates).eq('id', jobId);

    if (error) throw new Error(error.message);
  }, `completeScrapeJob(${jobId})`);
}

export async function getUserScrapeCountLast24h(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('scrape_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('triggered_by', userId)
    .gte('created_at', since);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getStuckProcessingJobs(stuckMinutes: number = 15): Promise<ScrapeJob[]> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('status', 'processing')
    .lt('started_at', cutoff);

  if (error) throw new Error(error.message);
  return (rows as DbScrapeJob[]).map(mapDbToScrapeJob);
}

export async function getRetryableFailedJobs(maxRetries: number = 3): Promise<ScrapeJob[]> {
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('status', 'failed')
    .lt('retry_count', maxRetries);

  if (error) throw new Error(error.message);
  return (rows as DbScrapeJob[]).map(mapDbToScrapeJob);
}

export async function resetJobToQueued(
  jobId: string,
  incrementRetry: boolean = false
): Promise<void> {
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = {
    status: 'queued',
    error_message: null,
    started_at: null,
    completed_at: null,
  };

  if (incrementRetry) {
    // Use raw SQL via RPC or just fetch-and-update
    const job = await getScrapeJobById(jobId);
    if (job) {
      updates.retry_count = job.retryCount + 1;
    }
  }

  const { error } = await supabase.from('scrape_jobs').update(updates).eq('id', jobId);
  if (error) throw new Error(error.message);
}

export async function markPermanentlyFailed(jobId: string): Promise<void> {
  return retryTerminalWrite(async () => {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('scrape_jobs')
      .update({
        status: 'permanently_failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) throw new Error(error.message);
  }, `markPermanentlyFailed(${jobId})`);
}

export async function failScrapeJob(jobId: string, errorMessage: string): Promise<void> {
  return retryTerminalWrite(async () => {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('scrape_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) throw new Error(error.message);
  }, `failScrapeJob(${jobId})`);
}

// ── Stuck-job reconciliation (#90 / D3) ─────────────────────────────────────
//
// Counterpart to the retry helper above. If a terminal write *did* fail past
// all retries (or the prior run crashed before reaching it), the parent
// `scrape_jobs` row sits in `processing` while every per-URL item is already
// terminal. The next time `processJobBatch(jobId)` runs for the same job,
// `reconcileStuckJob` notices the inconsistency and flips the parent to
// `completed` using the parent's existing aggregate counters (which are kept
// near-current by `updateScrapeJobProgress` flushes during the original run).
//
// Counter-derivation note: the design ideally derives `imported_count` etc.
// from the items themselves, but `scrape_job_items.stage` only carries
// `done`/`failed` — it cannot distinguish imported vs duplicate vs filtered.
// Those fan-out outcomes are tracked at the job level via per-URL increments
// inside `processJobBatch`. Trusting the job's last flushed counters is
// therefore the correct authoritative source; the reconciler's job is just to
// flip the status, not to re-derive counts.

export interface StuckJobReconciliation {
  reconciled: boolean;
  status?: ScrapeJob['status'];
  stats?: {
    processedUrls: number;
    totalUrls: number;
    importedCount: number;
    duplicateCount: number;
    errorCount: number;
    filteredCount: number;
  };
}

/**
 * Inspect a `scrape_jobs` row and, if it is stuck in `processing` despite
 * every linked `scrape_job_item` being terminal, transition it to
 * `completed` using the parent's existing counters. Idempotent and safe to
 * call repeatedly: returns `{ reconciled: false }` when there is nothing to
 * do (job not in `processing`, or any item still in flight).
 */
export async function reconcileStuckJob(jobId: string): Promise<StuckJobReconciliation> {
  const supabase = createAdminClient();

  const { data: jobRow, error: jobErr } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (!jobRow) return { reconciled: false };

  const job = mapDbToScrapeJob(jobRow as DbScrapeJob);
  if (job.status !== 'processing') {
    return { reconciled: false, status: job.status };
  }

  // Total URL count is empty → nothing to reconcile against.
  if (job.totalUrls === 0) {
    return { reconciled: false, status: job.status };
  }

  const { data: itemRows, error: itemsErr } = await supabase
    .from('scrape_job_items')
    .select('stage')
    .eq('job_id', jobId);
  if (itemsErr) throw new Error(itemsErr.message);

  const items = (itemRows ?? []) as { stage: ScrapeJobItemStage }[];

  // No item rows yet (legacy jobs) — refuse to reconcile, the original
  // caller will redo the work.
  if (items.length === 0) return { reconciled: false, status: job.status };

  // Every seeded item must be present and terminal; if the item count is
  // below total_urls, the original run hadn't seeded all rows yet.
  if (items.length < job.totalUrls) return { reconciled: false, status: job.status };
  if (!items.every((it) => isTerminalStage(it.stage))) {
    return { reconciled: false, status: job.status };
  }

  await completeScrapeJob(jobId, {
    processedUrls: job.processedUrls,
    importedCount: job.importedCount,
    duplicateCount: job.duplicateCount,
    errorCount: job.errorCount,
    filteredCount: job.filteredCount,
  });

  return {
    reconciled: true,
    status: 'completed',
    stats: {
      processedUrls: job.processedUrls,
      totalUrls: job.totalUrls,
      importedCount: job.importedCount,
      duplicateCount: job.duplicateCount,
      errorCount: job.errorCount,
      filteredCount: job.filteredCount,
    },
  };
}

export async function findValidationJobByKolSourceId(
  kolSourceId: string
): Promise<ScrapeJob | null> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('kol_source_id', kolSourceId)
    .eq('job_type', 'validation_scrape')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) return null;
  return mapDbToScrapeJob(row as DbScrapeJob);
}
