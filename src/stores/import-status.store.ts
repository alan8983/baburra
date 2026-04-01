import { create } from 'zustand';
import type { ImportBatchResult, ImportUrlResult } from '@/hooks/use-import';

export type UrlStatus = 'queued' | 'processing' | 'success' | 'error';

export interface ImportJobUrl {
  url: string;
  status: UrlStatus;
  result?: ImportUrlResult;
}

export interface ImportJob {
  id: string;
  urls: ImportJobUrl[];
  startedAt: number;
  estimatedSeconds: number;
  completedAt?: number;
  result?: ImportBatchResult;
}

interface ImportStatusState {
  jobs: Map<string, ImportJob>;
  addJob: (id: string, urls: string[], estimatedSeconds: number) => void;
  updateJobProcessing: (id: string) => void;
  completeJob: (id: string, result: ImportBatchResult) => void;
  failJob: (id: string, error: string) => void;
  dismissJob: (id: string) => void;
  hasActiveJobs: () => boolean;
}

let nextJobId = 1;

export function generateJobId(): string {
  return `import-${nextJobId++}-${Date.now()}`;
}

export const useImportStatusStore = create<ImportStatusState>((set, get) => ({
  jobs: new Map(),

  addJob: (id, urls, estimatedSeconds) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      jobs.set(id, {
        id,
        urls: urls.map((url) => ({ url, status: 'queued' })),
        startedAt: Date.now(),
        estimatedSeconds,
      });
      return { jobs };
    }),

  updateJobProcessing: (id) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      const job = jobs.get(id);
      if (job) {
        jobs.set(id, {
          ...job,
          urls: job.urls.map((u) => (u.status === 'queued' ? { ...u, status: 'processing' } : u)),
        });
      }
      return { jobs };
    }),

  completeJob: (id, result) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      const job = jobs.get(id);
      if (job) {
        const updatedUrls = job.urls.map((u) => {
          const urlResult = result.urlResults.find((r) => r.url === u.url);
          return {
            ...u,
            status: (urlResult?.status === 'error' ? 'error' : 'success') as UrlStatus,
            result: urlResult,
          };
        });
        jobs.set(id, {
          ...job,
          urls: updatedUrls,
          completedAt: Date.now(),
          result,
        });
      }
      return { jobs };
    }),

  failJob: (id, error) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      const job = jobs.get(id);
      if (job) {
        jobs.set(id, {
          ...job,
          urls: job.urls.map((u) => ({
            ...u,
            status: 'error' as UrlStatus,
            result: u.result ?? { url: u.url, status: 'error', error },
          })),
          completedAt: Date.now(),
        });
      }
      return { jobs };
    }),

  dismissJob: (id) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      jobs.delete(id);
      return { jobs };
    }),

  hasActiveJobs: () => {
    const { jobs } = get();
    for (const job of jobs.values()) {
      if (!job.completedAt) return true;
    }
    return false;
  },
}));
