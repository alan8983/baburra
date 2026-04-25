import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted Supabase mock ──
const mocks = vi.hoisted(() => {
  // The query builder is the chain: from().select().eq().eq().maybeSingle()
  // (single-row lookup) and from().select().eq().in() (batch). Both paths must
  // be mockable.
  const single = vi.fn();
  const batchSelectIn = vi.fn();
  const fromFn = vi.fn();
  return { single, batchSelectIn, fromFn };
});

vi.mock('@/infrastructure/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.fromFn }),
}));

import {
  resolveStock,
  resolveStocksBatch,
  normalizeTicker,
  clearTickerResolverCache,
} from '../ticker-resolver.service';

beforeEach(() => {
  clearTickerResolverCache();
  vi.clearAllMocks();
  mocks.fromFn.mockReset();
});

// Helper: mock the createAdminClient().from('stocks_master').select(...).eq(...).eq(...).maybeSingle()
// chain to return either a row or null.
function mockSingleHit(row: { ticker: string; name: string; market: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  mocks.fromFn.mockReturnValue({ select });
}

describe('normalizeTicker', () => {
  it('uppercases and trims', () => {
    expect(normalizeTicker(' aapl ', 'US')).toBe('AAPL');
  });

  it('adds .TW suffix to all-numeric TW codes', () => {
    expect(normalizeTicker('2357', 'TW')).toBe('2357.TW');
    expect(normalizeTicker('00631L', 'TW')).toBe('00631L.TW');
    expect(normalizeTicker('00631L.TW', 'TW')).toBe('00631L.TW'); // idempotent
    expect(normalizeTicker('2330.TW', 'TW')).toBe('2330.TW');
  });

  it('passes non-numeric TW tickers through (lookup will reject)', () => {
    expect(normalizeTicker('ASUS', 'TW')).toBe('ASUS');
    expect(normalizeTicker('UMC', 'TW')).toBe('UMC');
  });

  it('returns null for empty input', () => {
    expect(normalizeTicker('', 'US')).toBe(null);
    expect(normalizeTicker('   ', 'US')).toBe(null);
  });

  it('uppercases US/CRYPTO without adding suffix', () => {
    expect(normalizeTicker('aapl', 'US')).toBe('AAPL');
    expect(normalizeTicker('btc', 'CRYPTO')).toBe('BTC');
  });
});

describe('resolveStock', () => {
  it('returns canonical row when ticker is in master, overriding name', async () => {
    // The bug we're fixing: Gemini calls 2353.TW "宏捷"; master has it as "宏碁".
    // resolveStock should return the master name, not echo Gemini's name.
    mockSingleHit({ ticker: '2353.TW', name: '宏碁', market: 'TW' });

    const result = await resolveStock('2353.TW', 'TW');
    expect(result).toEqual({ ticker: '2353.TW', name: '宏碁', market: 'TW' });
  });

  it('normalizes input before lookup (2357 → 2357.TW)', async () => {
    mockSingleHit({ ticker: '2357.TW', name: '華碩', market: 'TW' });

    const result = await resolveStock('2357', 'TW');
    expect(result).toEqual({ ticker: '2357.TW', name: '華碩', market: 'TW' });
  });

  it('returns null for hallucinated US tickers (CHROME, CLAUDE, SPACEX)', async () => {
    mockSingleHit(null);
    expect(await resolveStock('CHROME', 'US')).toBe(null);
    expect(await resolveStock('CLAUDE', 'US')).toBe(null);
    expect(await resolveStock('SPACEX', 'US')).toBe(null);
  });

  it('returns null for fabricated TW name 馮君 (any of its 9 mapped tickers)', async () => {
    mockSingleHit(null);
    // Any of 3044/6533/etc. that the master rejects → null.
    expect(await resolveStock('馮君', 'TW')).toBe(null);
  });

  it('returns null for non-numeric TW tickers (ASUS, UMC)', async () => {
    mockSingleHit(null);
    expect(await resolveStock('ASUS', 'TW')).toBe(null);
    expect(await resolveStock('UMC', 'TW')).toBe(null);
  });

  it('returns null on empty/whitespace input without hitting the DB', async () => {
    expect(await resolveStock('', 'US')).toBe(null);
    expect(await resolveStock('   ', 'TW')).toBe(null);
    // The supabase mock should never have been called.
    expect(mocks.fromFn).not.toHaveBeenCalled();
  });

  it('caches positive results within a process', async () => {
    mockSingleHit({ ticker: 'AAPL', name: 'Apple Inc.', market: 'US' });

    const r1 = await resolveStock('AAPL', 'US');
    const r2 = await resolveStock('aapl', 'US'); // case variants normalize the same
    expect(r1).toEqual({ ticker: 'AAPL', name: 'Apple Inc.', market: 'US' });
    expect(r2).toEqual(r1);
    // Two calls, but mock only configured once → cache must have served the second.
    expect(mocks.fromFn).toHaveBeenCalledTimes(1);
  });

  it('caches negative results so a hallucination is rejected once', async () => {
    mockSingleHit(null);

    expect(await resolveStock('CLAUDE', 'US')).toBe(null);
    expect(await resolveStock('CLAUDE', 'US')).toBe(null);
    expect(mocks.fromFn).toHaveBeenCalledTimes(1);
  });

  it('treats same ticker in different markets as independent lookups', async () => {
    // 'STX' is Seagate (US) AND Stacks (CRYPTO). Cache must key on (ticker, market).
    let firstCall = true;
    mocks.fromFn.mockImplementation(() => {
      const data = firstCall
        ? { ticker: 'STX', name: 'Seagate Technology Holdings PLC', market: 'US' }
        : { ticker: 'STX', name: 'Stacks', market: 'CRYPTO' };
      firstCall = false;
      const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
      const eq2 = vi.fn().mockReturnValue({ maybeSingle });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const select = vi.fn().mockReturnValue({ eq: eq1 });
      return { select };
    });

    const us = await resolveStock('STX', 'US');
    const crypto = await resolveStock('STX', 'CRYPTO');
    expect(us?.name).toBe('Seagate Technology Holdings PLC');
    expect(crypto?.name).toBe('Stacks');
  });

  it('throws on transient DB error (does not silently drop)', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'connection lost' } });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    mocks.fromFn.mockReturnValue({ select });

    await expect(resolveStock('AAPL', 'US')).rejects.toThrow(/connection lost/);
  });
});

describe('resolveStocksBatch', () => {
  it('groups by market, makes one query per market, returns map keyed by raw input', async () => {
    let calls = 0;
    mocks.fromFn.mockImplementation(() => {
      calls++;
      const data =
        calls === 1
          ? [
              { ticker: 'AAPL', name: 'Apple Inc.', market: 'US' },
              { ticker: 'NVDA', name: 'NVIDIA Corporation', market: 'US' },
            ]
          : [{ ticker: '2330.TW', name: '台積電', market: 'TW' }];
      const inFn = vi.fn().mockResolvedValue({ data, error: null });
      const eq = vi.fn().mockReturnValue({ in: inFn });
      const select = vi.fn().mockReturnValue({ eq });
      return { select };
    });

    const result = await resolveStocksBatch([
      { ticker: 'AAPL', market: 'US' },
      { ticker: 'NVDA', market: 'US' },
      { ticker: '2330', market: 'TW' }, // should be normalized to 2330.TW
    ]);

    expect(result.get('AAPL')).toEqual({ ticker: 'AAPL', name: 'Apple Inc.', market: 'US' });
    expect(result.get('NVDA')).toEqual({
      ticker: 'NVDA',
      name: 'NVIDIA Corporation',
      market: 'US',
    });
    expect(result.get('2330')).toEqual({ ticker: '2330.TW', name: '台積電', market: 'TW' });
    expect(calls).toBe(2); // one for US batch, one for TW batch
  });

  it('returns null entries for tickers not in master', async () => {
    mocks.fromFn.mockImplementation(() => {
      const inFn = vi.fn().mockResolvedValue({
        data: [{ ticker: 'AAPL', name: 'Apple Inc.', market: 'US' }],
        error: null,
      });
      const eq = vi.fn().mockReturnValue({ in: inFn });
      const select = vi.fn().mockReturnValue({ eq });
      return { select };
    });

    const result = await resolveStocksBatch([
      { ticker: 'AAPL', market: 'US' },
      { ticker: 'CHROME', market: 'US' }, // hallucination
    ]);

    expect(result.get('AAPL')?.name).toBe('Apple Inc.');
    expect(result.get('CHROME')).toBe(null);
  });

  it('returns empty map for empty input without hitting DB', async () => {
    const result = await resolveStocksBatch([]);
    expect(result.size).toBe(0);
    expect(mocks.fromFn).not.toHaveBeenCalled();
  });
});
