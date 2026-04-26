/**
 * Covers `reconcileStuckJob` from `scrape-job.repository`. The reconciler
 * exists to self-heal a job left in `processing` after a terminal write
 * failed (#90 / D3). It must (a) flip status when every per-URL item is
 * terminal, (b) leave the job alone when any item is still in flight, and
 * (c) leave the job alone when it's already terminal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScrapeJobItemStage } from '@/domain/models';

type Row = Record<string, unknown> | null;

interface ChainState {
  table: 'scrape_jobs' | 'scrape_job_items';
  filters: Record<string, unknown>;
  updates: Record<string, unknown> | null;
  selectCols: string;
}

const stateLog: ChainState[] = [];
const updateLog: {
  table: string;
  updates: Record<string, unknown>;
  eq: Record<string, unknown>;
}[] = [];

let scrapeJobsRow: Row = null;
let scrapeJobItemRows: { stage: ScrapeJobItemStage }[] = [];

function makeChain(table: ChainState['table']) {
  const state: ChainState = { table, filters: {}, updates: null, selectCols: '*' };

  const chain = {
    select(cols: string) {
      state.selectCols = cols;
      return chain;
    },
    update(values: Record<string, unknown>) {
      state.updates = values;
      return chain;
    },
    eq(col: string, value: unknown) {
      state.filters[col] = value;
      // Update operations resolve here when chained as
      // `.update(...).eq(...)` — log it immediately.
      if (state.updates) {
        updateLog.push({ table: state.table, updates: state.updates, eq: { [col]: value } });
        state.updates = null;
        return Promise.resolve({ data: null, error: null }) as unknown as typeof chain & {
          then: PromiseLike<unknown>['then'];
        };
      }
      return chain;
    },
    maybeSingle() {
      stateLog.push({ ...state });
      if (state.table === 'scrape_jobs')
        return Promise.resolve({ data: scrapeJobsRow, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    then(onFulfilled: (v: unknown) => unknown) {
      stateLog.push({ ...state });
      const result =
        state.table === 'scrape_job_items'
          ? { data: scrapeJobItemRows, error: null }
          : { data: scrapeJobsRow, error: null };
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  return chain;
}

const fromMock = vi.fn((table: string) => makeChain(table as ChainState['table']));

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

import { reconcileStuckJob } from '../scrape-job.repository';

const baseJob = {
  id: 'job-1',
  kol_source_id: 'src-1',
  job_type: 'profile_scrape',
  status: 'processing' as const,
  triggered_by: null,
  total_urls: 3,
  processed_urls: 3,
  imported_count: 2,
  duplicate_count: 0,
  error_count: 1,
  filtered_count: 0,
  discovered_urls: ['u1', 'u2', 'u3'],
  retry_count: 0,
  error_message: null,
  started_at: '2024-01-01T00:00:00.000Z',
  completed_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  stateLog.length = 0;
  updateLog.length = 0;
  scrapeJobsRow = { ...baseJob };
  scrapeJobItemRows = [];
  fromMock.mockClear();
});

describe('reconcileStuckJob (#90 / D3)', () => {
  it('flips a `processing` job to `completed` when every item is terminal', async () => {
    scrapeJobItemRows = [{ stage: 'done' }, { stage: 'done' }, { stage: 'failed' }];

    const result = await reconcileStuckJob('job-1');

    expect(result.reconciled).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.stats).toEqual({
      processedUrls: 3,
      totalUrls: 3,
      importedCount: 2,
      duplicateCount: 0,
      errorCount: 1,
      filteredCount: 0,
    });
    // The completion write happened.
    const completionWrite = updateLog.find(
      (u) => u.table === 'scrape_jobs' && u.updates.status === 'completed'
    );
    expect(completionWrite).toBeDefined();
    expect(completionWrite!.eq).toEqual({ id: 'job-1' });
  });

  it('returns reconciled:false when any item is non-terminal', async () => {
    scrapeJobItemRows = [{ stage: 'done' }, { stage: 'analyzing' }, { stage: 'done' }];

    const result = await reconcileStuckJob('job-1');

    expect(result.reconciled).toBe(false);
    expect(result.status).toBe('processing');
    // No terminal write should have been issued.
    expect(updateLog.find((u) => u.updates.status === 'completed')).toBeUndefined();
  });

  it('returns reconciled:false when parent is already completed', async () => {
    scrapeJobsRow = { ...baseJob, status: 'completed' };
    scrapeJobItemRows = [{ stage: 'done' }, { stage: 'done' }, { stage: 'done' }];

    const result = await reconcileStuckJob('job-1');

    expect(result.reconciled).toBe(false);
    expect(result.status).toBe('completed');
    expect(updateLog.length).toBe(0);
  });

  it('returns reconciled:false when item rows are missing (legacy job)', async () => {
    scrapeJobItemRows = [];

    const result = await reconcileStuckJob('job-1');

    expect(result.reconciled).toBe(false);
    expect(updateLog.length).toBe(0);
  });

  it('returns reconciled:false when items are seeded but fewer than total_urls', async () => {
    scrapeJobItemRows = [{ stage: 'done' }, { stage: 'done' }]; // total_urls = 3

    const result = await reconcileStuckJob('job-1');

    expect(result.reconciled).toBe(false);
    expect(updateLog.length).toBe(0);
  });
});
