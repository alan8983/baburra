'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';

// ── Types ──

export interface ScrapeJobInput {
  url: string;
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

export function useInitiateScrape() {
  const queryClient = useQueryClient();
  return useMutation<ScrapeJob, Error, ScrapeJobInput>({
    mutationFn: async (input) => {
      const res = await fetch(API_ROUTES.SCRAPE_PROFILE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(res);
      return res.json();
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
      return res.json();
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
