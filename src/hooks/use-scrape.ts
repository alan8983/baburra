'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';
import { createClient as createSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import type { ScrapeJobItem, ScrapeJobItemStage } from '@/domain/models';

// ── Types ──

export interface DiscoverProfileResult {
  kolName: string;
  kolAvatarUrl: string | null;
  platform: string;
  platformId: string;
  platformUrl: string;
  discoveredUrls: Array<{
    url: string;
    title?: string;
    publishedAt?: string;
    contentType?: 'long_video' | 'short' | 'live_stream';
    captionAvailable?: boolean;
    durationSeconds?: number;
    estimatedCreditCost?: number;
  }>;
  totalCount: number;
}

export interface ScrapeJobInput {
  url: string;
  selectedUrls?: string[];
}

export interface ScrapeJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'permanently_failed';
  kolId?: string;
  kolName?: string;
  errorMessage?: string;
  processedUrls?: number;
  totalUrls?: number;
  importedCount?: number;
  duplicateCount?: number;
  errorCount?: number;
  filteredCount?: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Query Keys ──

export const scrapeKeys = {
  all: ['scrape'] as const,
  jobs: () => [...scrapeKeys.all, 'jobs'] as const,
  job: (id: string) => [...scrapeKeys.jobs(), id] as const,
  items: (jobId: string) => [...scrapeKeys.all, 'items', jobId] as const,
};

// ── Realtime row shapes ──

interface DbScrapeJobItem {
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
}

function mapDbItem(row: DbScrapeJobItem): ScrapeJobItem {
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

// ── Hooks ──

export function useDiscoverProfile() {
  return useMutation<DiscoverProfileResult, Error, { url: string }>({
    mutationFn: async (input) => {
      const res = await fetch(API_ROUTES.SCRAPE_DISCOVER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: input.url }),
      });
      await throwIfNotOk(res);
      return res.json();
    },
  });
}

interface InitiateScrapeResponse {
  jobId: string;
  kolId: string;
  kolName: string;
  sourceId: string;
  totalUrls: number;
  status: string;
}

export function useInitiateScrape() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; jobId: string }, Error, ScrapeJobInput>({
    mutationFn: async (input) => {
      const res = await fetch(API_ROUTES.SCRAPE_PROFILE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileUrl: input.url,
          ...(input.selectedUrls && { selectedUrls: input.selectedUrls }),
        }),
      });
      await throwIfNotOk(res);
      const data: InitiateScrapeResponse = await res.json();
      return { id: data.jobId, jobId: data.jobId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrapeKeys.jobs() });
    },
  });
}

export function useScrapeJob(jobId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: scrapeKeys.job(jobId ?? ''),
    queryFn: async (): Promise<ScrapeJob> => {
      const res = await fetch(API_ROUTES.SCRAPE_JOB(jobId!));
      await throwIfNotOk(res);
      const job: ScrapeJob = await res.json();

      // Drive processing forward: if job has remaining URLs, trigger next batch
      if (job.status === 'processing' || job.status === 'queued') {
        const hasRemaining =
          job.totalUrls != null && job.processedUrls != null && job.processedUrls < job.totalUrls;
        if (hasRemaining) {
          // Fire-and-forget: continue processing in the background
          fetch(API_ROUTES.SCRAPE_JOB_CONTINUE(jobId!), { method: 'POST' }).catch(() => {});
        }
      }

      return job;
    },
    enabled: !!jobId,
    staleTime: 0,
    // Polling is now a 10s safety net in case the Realtime channel drops.
    // Per-job push updates arrive via the effect below.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'processing' || status === 'queued' ? 10_000 : false;
    },
  });

  // Subscribe to Realtime updates on this job row. The channel pushes every
  // UPDATE to the job directly into the React Query cache, collapsing the
  // "frozen at 0%" gap between pipeline writes and the UI re-render.
  useEffect(() => {
    if (!jobId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`scrape-job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scrape_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const next = payload.new as Record<string, unknown> | null;
          if (!next) return;
          // Merge into the existing cached shape rather than replacing —
          // the API-returned ScrapeJob carries joined fields (kolName) that
          // Postgres notifications don't include.
          queryClient.setQueryData<ScrapeJob>(
            scrapeKeys.job(jobId),
            (prev) =>
              ({
                ...(prev ?? ({ id: jobId } as ScrapeJob)),
                status: (next.status as ScrapeJob['status']) ?? prev?.status,
                processedUrls: (next.processed_urls as number) ?? prev?.processedUrls,
                totalUrls: (next.total_urls as number) ?? prev?.totalUrls,
                importedCount: (next.imported_count as number) ?? prev?.importedCount,
                duplicateCount: (next.duplicate_count as number) ?? prev?.duplicateCount,
                errorCount: (next.error_count as number) ?? prev?.errorCount,
                filteredCount: (next.filtered_count as number) ?? prev?.filteredCount,
                errorMessage: (next.error_message as string | null) ?? prev?.errorMessage,
                completedAt: (next.completed_at as string | null) ?? prev?.completedAt,
                updatedAt:
                  (next.updated_at as string | undefined) ??
                  prev?.updatedAt ??
                  new Date().toISOString(),
              }) as ScrapeJob
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, queryClient]);

  return query;
}

/**
 * Subscribe to per-URL progress for a scrape job. Fetches the initial list
 * once, then applies INSERT/UPDATE/DELETE events from the `scrape_job_items`
 * Realtime channel. Returns items sorted by ordinal.
 */
export function useScrapeJobItems(jobId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: scrapeKeys.items(jobId ?? ''),
    queryFn: async (): Promise<ScrapeJobItem[]> => {
      const res = await fetch(API_ROUTES.SCRAPE_JOB_ITEMS(jobId!));
      await throwIfNotOk(res);
      const raw = (await res.json()) as DbScrapeJobItem[] | ScrapeJobItem[];
      // Server returns domain-shape items already (camelCase). Guard against
      // an accidental snake_case response so future-proofing is cheap.
      if (Array.isArray(raw) && raw.length > 0 && 'job_id' in (raw[0] as object)) {
        return (raw as DbScrapeJobItem[]).map(mapDbItem);
      }
      return raw as ScrapeJobItem[];
    },
    enabled: !!jobId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!jobId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`scrape-job-items-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scrape_job_items',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          queryClient.setQueryData<ScrapeJobItem[]>(scrapeKeys.items(jobId), (prev) => {
            const current = prev ?? [];
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as { id?: string } | null;
              if (!deleted?.id) return current;
              return current.filter((item) => item.id !== deleted.id);
            }
            const row = payload.new as DbScrapeJobItem | null;
            if (!row?.id) return current;
            const incoming = mapDbItem(row);
            const existingIdx = current.findIndex((item) => item.id === incoming.id);
            if (existingIdx === -1) {
              // INSERT — append and resort by ordinal
              return [...current, incoming].sort((a, b) => a.ordinal - b.ordinal);
            }
            // UPDATE — replace in place
            const next = [...current];
            next[existingIdx] = incoming;
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, queryClient]);

  return query;
}

export function useScrapeJobs() {
  return useQuery({
    queryKey: scrapeKeys.jobs(),
    queryFn: async (): Promise<ScrapeJob[]> => {
      const res = await fetch(API_ROUTES.SCRAPE_JOBS);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

export function useActiveScrapeForKol(kolId: string | undefined) {
  const { data: jobs } = useScrapeJobs();
  if (!kolId || !jobs) return null;
  return (
    jobs.find((j) => j.kolId === kolId && (j.status === 'processing' || j.status === 'queued')) ??
    null
  );
}
