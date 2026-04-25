/**
 * Covers `retryTerminalWrite` from `scrape-job.repository`. The helper exists
 * to make a single in-flight Supabase blip survivable for terminal writes
 * (`completeScrapeJob`, `failScrapeJob`, `markPermanentlyFailed`,
 * `updateScrapeStatus`). Three cases pin the contract: one-blip recovery,
 * exhausted-retry failure, and pass-through on non-network errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryTerminalWrite } from '../scrape-job.repository';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('retryTerminalWrite (#90 / D3)', () => {
  it('retries past a single transient `fetch failed` and resolves with the success value', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('TypeError: fetch failed');
      return 'ok';
    });

    const promise = retryTerminalWrite(fn, 'unit-test');
    // Drain the 250ms backoff between attempt 1 and attempt 2.
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all 4 attempts on persistent network failure', async () => {
    const fn = vi.fn(async () => {
      throw new Error('fetch failed');
    });

    const promise = retryTerminalWrite(fn, 'unit-test').catch((e) => e);
    // Drain the full backoff schedule: 250 + 500 + 1000 = 1750ms.
    await vi.advanceTimersByTimeAsync(1750);
    const err = await promise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('fetch failed');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('throws immediately on non-network error (e.g. 23505 unique violation)', async () => {
    const fn = vi.fn(async () => {
      const err = new Error('duplicate key value violates unique constraint "post_stocks_pkey"');
      (err as Error & { code?: string }).code = '23505';
      throw err;
    });

    await expect(retryTerminalWrite(fn, 'unit-test')).rejects.toThrow(/duplicate key/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a 5xx PostgREST status', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error('upstream Supabase 503');
        (err as Error & { status?: number }).status = 503;
        throw err;
      }
      return 'ok';
    });

    const promise = retryTerminalWrite(fn, 'unit-test');
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
