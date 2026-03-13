'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';

// ── Types ──

export interface DiscoverProfileResult {
  kolName: string;
  kolAvatarUrl: string | null;
  platform: string;
  platformId: string;
  platformUrl: string;
  discoveredUrls: Array<{ url: string; title?: string; publishedAt?: string }>;
  totalCount: number;
}

export interface ScrapeJobInput {
  url: string;
  selectedUrls?: string[];
}

export interface ScrapeJob {
  id: string;
  url: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'permanently_failed';
  kolId?: string;
  kolName?: string;
  error?: string;
  processedUrls?: number;
  totalUrls?: number;
  importedCount?: number;
  duplicateCount?: number;
  errorCount?: number;
  stats?: {
    videosFound: number;
    postsCreated: number;
    duplicates: number;
    errors: number;
  };
  createdAt: string;
  updatedAt: string;
}

// ── Query Keys ──

export const scrapeKeys = {
  all: ['scrape'] as const,
  jobs: () => [...scrapeKeys.all, 'jobs'] as const,
  job: (id: string) => [...scrapeKeys.jobs(), id] as const,
};

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
  return useQuery({
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
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'processing' || status === 'queued' ? 5000 : false;
    },
  });
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
