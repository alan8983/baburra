import { create } from 'zustand';

/**
 * Zustand store for the non-blocking batch import flow.
 *
 * Each entry represents an import triggered from a background flow (e.g.
 * the input form's "Import in background" button). Once the POST to
 * `/api/import/batch` returns, the local job is linked to a real
 * `scrape_jobs` row via `scrapeJobId`, and the toast/status UI subscribes
 * to that job for per-URL progress.
 *
 * The URL-level state here is intentionally coarse — detailed per-URL
 * progress lives in the `scrape_job_items` Realtime channel consumed by
 * ScrapeProgress and the import status toast.
 */

export type JobPhase = 'queued' | 'processing' | 'completed' | 'failed';

export interface ImportJob {
  id: string;
  urls: string[];
  startedAt: number;
  estimatedSeconds: number;
  phase: JobPhase;
  scrapeJobId?: string;
  errorMessage?: string;
  completedAt?: number;
}

interface ImportStatusState {
  jobs: Map<string, ImportJob>;
  addJob: (id: string, urls: string[], estimatedSeconds: number) => void;
  updateJobProcessing: (id: string) => void;
  attachScrapeJob: (id: string, scrapeJobId: string) => void;
  completeJob: (id: string) => void;
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
        urls,
        startedAt: Date.now(),
        estimatedSeconds,
        phase: 'queued',
      });
      return { jobs };
    }),

  updateJobProcessing: (id) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      const job = jobs.get(id);
      if (job) {
        jobs.set(id, { ...job, phase: 'processing' });
      }
      return { jobs };
    }),

  attachScrapeJob: (id, scrapeJobId) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      const job = jobs.get(id);
      if (job) {
        jobs.set(id, { ...job, scrapeJobId, phase: 'processing' });
      }
      return { jobs };
    }),

  completeJob: (id) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      const job = jobs.get(id);
      if (job) {
        jobs.set(id, { ...job, phase: 'completed', completedAt: Date.now() });
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
          phase: 'failed',
          errorMessage: error,
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
