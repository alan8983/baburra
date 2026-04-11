// Scrape Job Repository — CRUD for scrape_jobs table

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { ScrapeJob, ScrapeJobType } from '@/domain/models';

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
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('scrape_jobs')
    .update({
      status: 'permanently_failed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) throw new Error(error.message);
}

export async function failScrapeJob(jobId: string, errorMessage: string): Promise<void> {
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
