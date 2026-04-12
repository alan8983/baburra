/**
 * Scrape Job Item Repository Tests
 *
 * Verifies:
 *  - createScrapeJobItems seeds one row per URL with ordinal + queued stage
 *  - updateScrapeJobItemStage only writes the fields supplied in meta
 *  - started_at is only set on the first transition out of 'queued'
 *  - finished_at is set when stage reaches a terminal value
 *  - failScrapeJobItem sets stage + error_message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import {
  createScrapeJobItems,
  updateScrapeJobItemStage,
  failScrapeJobItem,
  updateScrapeJobItemDownloadProgress,
} from '../scrape-job-item.repository';

const JOB_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = '22222222-2222-2222-2222-222222222222';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    job_id: JOB_ID,
    url: 'https://example.com/1',
    title: null,
    ordinal: 0,
    stage: 'queued',
    bytes_downloaded: null,
    bytes_total: null,
    duration_seconds: null,
    error_message: null,
    started_at: null,
    finished_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('scrape-job-item.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createScrapeJobItems', () => {
    it('returns an empty array when no items are supplied without hitting Supabase', async () => {
      const result = await createScrapeJobItems(JOB_ID, []);
      expect(result).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('inserts one row per URL with sequential ordinals and queued stage', async () => {
      let capturedRows: Array<Record<string, unknown>> = [];
      mockFrom.mockImplementation(() => ({
        insert: (rows: Array<Record<string, unknown>>) => {
          capturedRows = rows;
          return {
            select: () => ({
              order: () =>
                Promise.resolve({
                  data: rows.map((r, i) => makeRow({ ...r, id: `item-${i}`, ordinal: i })),
                  error: null,
                }),
            }),
          };
        },
      }));

      const items = await createScrapeJobItems(JOB_ID, [
        { url: 'https://example.com/a', title: 'A' },
        { url: 'https://example.com/b' },
        { url: 'https://example.com/c', title: null },
      ]);

      expect(items).toHaveLength(3);
      expect(capturedRows).toHaveLength(3);
      expect(capturedRows[0]).toMatchObject({
        job_id: JOB_ID,
        url: 'https://example.com/a',
        title: 'A',
        ordinal: 0,
        stage: 'queued',
      });
      expect(capturedRows[1]).toMatchObject({ ordinal: 1, title: null });
      expect(capturedRows[2]).toMatchObject({ ordinal: 2, title: null });
    });

    it('throws when Supabase returns an error', async () => {
      mockFrom.mockImplementation(() => ({
        insert: () => ({
          select: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
          }),
        }),
      }));

      await expect(
        createScrapeJobItems(JOB_ID, [{ url: 'https://example.com/x' }])
      ).rejects.toThrow('boom');
    });
  });

  describe('updateScrapeJobItemStage', () => {
    it('writes only the stage when no meta is supplied, and leaves started_at null on queued→queued', async () => {
      const captured: Array<Record<string, unknown>> = [];
      mockFrom.mockImplementation(() => ({
        update: (updates: Record<string, unknown>) => {
          captured.push(updates);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }));

      await updateScrapeJobItemStage(ITEM_ID, 'queued');

      expect(captured).toHaveLength(1);
      expect(captured[0]).toEqual({ stage: 'queued' });
    });

    it('sets started_at the first time an item transitions out of queued', async () => {
      const captured: Array<Record<string, unknown>> = [];
      let readCount = 0;

      mockFrom.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
              readCount++;
              return Promise.resolve({ data: { started_at: null }, error: null });
            },
          }),
        }),
        update: (updates: Record<string, unknown>) => {
          captured.push(updates);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }));

      await updateScrapeJobItemStage(ITEM_ID, 'downloading');

      expect(readCount).toBe(1);
      expect(captured).toHaveLength(1);
      expect(captured[0].stage).toBe('downloading');
      expect(captured[0].started_at).toEqual(expect.any(String));
      expect(captured[0].finished_at).toBeUndefined();
    });

    it('does NOT overwrite started_at on subsequent stage transitions', async () => {
      const captured: Array<Record<string, unknown>> = [];

      mockFrom.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { started_at: '2026-04-11T10:00:00Z' },
                error: null,
              }),
          }),
        }),
        update: (updates: Record<string, unknown>) => {
          captured.push(updates);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }));

      await updateScrapeJobItemStage(ITEM_ID, 'transcribing');

      expect(captured[0].stage).toBe('transcribing');
      expect(captured[0].started_at).toBeUndefined();
    });

    it('sets finished_at when the item reaches done', async () => {
      const captured: Array<Record<string, unknown>> = [];

      mockFrom.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { started_at: '2026-04-11T10:00:00Z' },
                error: null,
              }),
          }),
        }),
        update: (updates: Record<string, unknown>) => {
          captured.push(updates);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }));

      await updateScrapeJobItemStage(ITEM_ID, 'done', { durationSeconds: 1234 });

      expect(captured[0]).toMatchObject({
        stage: 'done',
        duration_seconds: 1234,
        finished_at: expect.any(String),
      });
    });

    it('passes title through meta and forwards bytes to snake_case columns', async () => {
      const captured: Array<Record<string, unknown>> = [];

      mockFrom.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { started_at: '2026-04-11T10:00:00Z' },
                error: null,
              }),
          }),
        }),
        update: (updates: Record<string, unknown>) => {
          captured.push(updates);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }));

      await updateScrapeJobItemStage(ITEM_ID, 'downloading', {
        title: 'Gooaye EP238',
        bytesDownloaded: 5_000_000,
        bytesTotal: 20_000_000,
      });

      expect(captured[0]).toMatchObject({
        stage: 'downloading',
        title: 'Gooaye EP238',
        bytes_downloaded: 5_000_000,
        bytes_total: 20_000_000,
      });
    });
  });

  describe('failScrapeJobItem', () => {
    it('delegates to updateScrapeJobItemStage with stage=failed and an error message', async () => {
      const captured: Array<Record<string, unknown>> = [];
      mockFrom.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { started_at: null }, error: null }),
          }),
        }),
        update: (updates: Record<string, unknown>) => {
          captured.push(updates);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }));

      await failScrapeJobItem(ITEM_ID, 'Deepgram 503');

      expect(captured[0]).toMatchObject({
        stage: 'failed',
        error_message: 'Deepgram 503',
        finished_at: expect.any(String),
      });
    });
  });

  describe('updateScrapeJobItemDownloadProgress', () => {
    it('writes bytes_downloaded without touching the stage column', async () => {
      const captured: Array<Record<string, unknown>> = [];
      mockFrom.mockImplementation(() => ({
        update: (updates: Record<string, unknown>) => {
          captured.push(updates);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      }));

      await updateScrapeJobItemDownloadProgress(ITEM_ID, 2_500_000, 10_000_000);

      expect(captured[0]).toEqual({
        bytes_downloaded: 2_500_000,
        bytes_total: 10_000_000,
      });
      expect(captured[0].stage).toBeUndefined();
    });
  });
});
