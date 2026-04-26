/**
 * Vitest spec for check-kol-consistency.ts (Q4 in qa-standards).
 *
 * Mocks the admin Supabase client and the listPosts repository; asserts each
 * invariant's pass and fail branches independently. Covers the I-3 short-circuit
 * on missing volatility_thresholds.
 *
 * No real DB or network access — these tests run in the regular `npm test`
 * pipeline as a structural check on the script's invariant logic.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mocks ──

const mocks = vi.hoisted(() => {
  type ChainResult = { data?: unknown; count?: number; error?: { message: string } | null };
  const chainResults = new Map<string, ChainResult>();

  function makeChain(table: string) {
    const chain: Record<string, () => unknown> = {};
    const finalize = () => {
      const result = chainResults.get(table) ?? { data: null, error: null };
      return Promise.resolve(result);
    };
    // Every call returns the chain itself; terminal calls return the resolved result.
    const proxy: Record<string, unknown> = {};
    const passthrough = ['select', 'eq', 'in', 'limit'];
    const terminal = ['maybeSingle', 'single', 'then'];
    for (const k of passthrough) {
      proxy[k] = vi.fn(() => proxy);
    }
    for (const k of terminal) {
      proxy[k] = vi.fn((...args: unknown[]) => {
        const r = finalize();
        if (k === 'then') {
          // Allow `await` on the chain (after `.eq(...)`).
          const cb = args[0] as (v: unknown) => unknown;
          return r.then(cb);
        }
        return r;
      });
    }
    void chain;
    return proxy;
  }

  return {
    chainResults,
    fromCalls: [] as string[],
    from: vi.fn((table: string) => {
      mocks.fromCalls.push(table);
      return makeChain(table);
    }),
    listPosts: vi.fn(),
  };
});

vi.mock('../src/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

vi.mock('../src/infrastructure/repositories/post.repository', () => ({
  listPosts: mocks.listPosts,
}));

vi.mock('../src/infrastructure/repositories/scorecard-cache.repository', () => ({
  SCORECARD_TTL_MS: 12 * 60 * 60 * 1000,
}));

vi.mock('../src/domain/calculators', () => ({
  CLASSIFIER_VERSION: 2,
}));

import { checkKolConsistency } from './check-kol-consistency';

const KOL = 'kol-test-1';
const NVDA_ID = 'stock-nvda';
const AAPL_ID = 'stock-aapl';

function setTable(table: string, result: { data?: unknown; count?: number }) {
  mocks.chainResults.set(table, result);
}

function freshCacheRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    post_count: 138,
    stale: false,
    computed_at: new Date().toISOString(),
    classifier_version: 2,
    buckets_by_stock: {
      [NVDA_ID]: { day30: { total: 5 } },
      [AAPL_ID]: { day30: { total: 3 } },
    },
    ...overrides,
  };
}

function postStockRows(rows: Array<{ stock_id: string; ticker: string }>) {
  return rows.map((r) => ({ stock_id: r.stock_id, stocks: { id: r.stock_id, ticker: r.ticker } }));
}

describe('checkKolConsistency', () => {
  beforeEach(() => {
    mocks.chainResults.clear();
    mocks.fromCalls.length = 0;
    mocks.listPosts.mockReset();
  });

  it('passes when all four invariants hold', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    setTable('kol_scorecard_cache', { data: freshCacheRow() });
    // 5 NVDA rows + 3 AAPL rows; both eligible (≥3) and both have buckets.
    setTable(
      'post_stocks',
      {
        data: postStockRows([
          ...Array(5).fill({ stock_id: NVDA_ID, ticker: 'NVDA' }),
          ...Array(3).fill({ stock_id: AAPL_ID, ticker: 'AAPL' }),
        ]),
      }
    );
    setTable('volatility_thresholds', { count: 100, data: [] });
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    expect(report.pass).toBe(true);
    expect(report.results.map((r) => r.invariant)).toEqual(['I-1', 'I-2', 'I-3', 'I-4']);
    for (const r of report.results) expect(r.pass).toBe(true);
  });

  it('fails I-1 when kol_stats denorm drifts from db count', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 100 } }); // drift
    setTable('kol_scorecard_cache', { data: freshCacheRow({ post_count: 138 }) });
    setTable('post_stocks', { data: [] });
    setTable('volatility_thresholds', { count: 0, data: [] });
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    const i1 = report.results.find((r) => r.invariant === 'I-1')!;
    expect(i1.pass).toBe(false);
    expect(i1.detail).toMatchObject({ kol_stats_post_count: 100, db_post_count: 138 });
    expect(report.pass).toBe(false);
  });

  it('fails I-2 when cache is stale', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    setTable('kol_scorecard_cache', { data: freshCacheRow({ stale: true }) });
    setTable('post_stocks', { data: [] });
    setTable('volatility_thresholds', { count: 0, data: [] });
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    const i2 = report.results.find((r) => r.invariant === 'I-2')!;
    expect(i2.pass).toBe(false);
    expect(i2.detail).toMatchObject({ stale: true });
  });

  it('fails I-2 when cache is older than 12 h', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    const ancient = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    setTable('kol_scorecard_cache', { data: freshCacheRow({ computed_at: ancient }) });
    setTable('post_stocks', { data: [] });
    setTable('volatility_thresholds', { count: 0, data: [] });
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    const i2 = report.results.find((r) => r.invariant === 'I-2')!;
    expect(i2.pass).toBe(false);
  });

  it('fails I-2 when classifier version drifts', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    setTable('kol_scorecard_cache', { data: freshCacheRow({ classifier_version: 1 }) });
    setTable('post_stocks', { data: [] });
    setTable('volatility_thresholds', { count: 0, data: [] });
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    const i2 = report.results.find((r) => r.invariant === 'I-2')!;
    expect(i2.pass).toBe(false);
  });

  it('fails I-3 when an eligible stock has zero day30 samples and a populated threshold', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    setTable(
      'kol_scorecard_cache',
      { data: freshCacheRow({ buckets_by_stock: { [NVDA_ID]: { day30: { total: 0 } } } }) }
    );
    setTable(
      'post_stocks',
      { data: postStockRows(Array(5).fill({ stock_id: NVDA_ID, ticker: 'NVDA' })) }
    );
    setTable('volatility_thresholds', { count: 100, data: [] }); // threshold exists → no short-circuit
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    const i3 = report.results.find((r) => r.invariant === 'I-3')!;
    expect(i3.pass).toBe(false);
    const failures = (i3.detail as { failures: Array<{ ticker: string }> }).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0].ticker).toBe('NVDA');
  });

  it('I-3 short-circuits to pass when volatility_thresholds is empty for a ticker', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    setTable(
      'kol_scorecard_cache',
      { data: freshCacheRow({ buckets_by_stock: { [NVDA_ID]: { day30: { total: 0 } } } }) }
    );
    setTable(
      'post_stocks',
      { data: postStockRows(Array(5).fill({ stock_id: NVDA_ID, ticker: 'NVDA' })) }
    );
    setTable('volatility_thresholds', { count: 0, data: [] }); // empty → cold-start short-circuit
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    const i3 = report.results.find((r) => r.invariant === 'I-3')!;
    expect(i3.pass).toBe(true);
  });

  it('I-3 ignores stocks below the 3-post threshold', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    setTable(
      'kol_scorecard_cache',
      { data: freshCacheRow({ buckets_by_stock: {} }) } // no buckets at all
    );
    setTable(
      'post_stocks',
      { data: postStockRows([{ stock_id: NVDA_ID, ticker: 'NVDA' }, { stock_id: AAPL_ID, ticker: 'AAPL' }]) }
    );
    setTable('volatility_thresholds', { count: 0, data: [] });
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    const i3 = report.results.find((r) => r.invariant === 'I-3')!;
    expect(i3.pass).toBe(true); // 1 post each → not eligible
  });

  it('fails I-4 when listPosts.total disagrees with kol_stats.post_count', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    setTable('kol_scorecard_cache', { data: freshCacheRow() });
    setTable('post_stocks', { data: [] });
    setTable('volatility_thresholds', { count: 0, data: [] });
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 100 }); // pagination cap regression

    const report = await checkKolConsistency(KOL);
    const i4 = report.results.find((r) => r.invariant === 'I-4')!;
    expect(i4.pass).toBe(false);
    expect(i4.detail).toMatchObject({ list_posts_total: 100, kol_stats_post_count: 138 });
  });

  it('fails I-2 when the scorecard cache row is missing entirely', async () => {
    setTable('posts', { count: 138 });
    setTable('kol_stats', { data: { post_count: 138 } });
    setTable('kol_scorecard_cache', { data: null });
    setTable('post_stocks', { data: [] });
    setTable('volatility_thresholds', { count: 0, data: [] });
    mocks.listPosts.mockResolvedValueOnce({ data: [], total: 138 });

    const report = await checkKolConsistency(KOL);
    const i2 = report.results.find((r) => r.invariant === 'I-2')!;
    expect(i2.pass).toBe(false);
    expect(i2.detail).toMatchObject({ error: 'no kol_scorecard_cache row' });
  });
});
