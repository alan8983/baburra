import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateRealizedVolatility,
  countOverlappingSamples,
  filterStrictlyBefore,
  getVolatilityThreshold,
  UnsupportedMarketError,
  VolatilityCache,
  __resetVolatilityCache,
  type PriceSeriesPoint,
  type VolatilityProvider,
  type Market,
} from './volatility.calculator';

function makeSeries(closes: number[], startDate = '2024-01-01'): PriceSeriesPoint[] {
  const start = new Date(startDate);
  return closes.map((close, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

describe('calculateRealizedVolatility', () => {
  it('3.1 matches hand-computed sample stdev for synthetic series', () => {
    // Constant series → all returns 0 → stdev 0
    expect(calculateRealizedVolatility(makeSeries([100, 100, 100, 100]), 1 as never)).toBe(0);
    // Returns r_i = p[i+1]/p[i]-1: [1, 0, -0.5, 1] → stdev with Bessel
    const prices = makeSeries([100, 200, 200, 100, 200]);
    const sigma = calculateRealizedVolatility(prices, 1 as never);
    const returns = [1, 0, -0.5, 1];
    const mean = returns.reduce((a, b) => a + b, 0) / 4;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / 3;
    expect(sigma).toBeCloseTo(Math.sqrt(variance), 10);
  });

  it('returns 0 for series too short to produce returns', () => {
    expect(calculateRealizedVolatility(makeSeries([100, 110]), 5)).toBe(0);
  });
});

describe('countOverlappingSamples', () => {
  it('3.2 sample count equals series.length - periodDays', () => {
    expect(countOverlappingSamples(makeSeries(new Array(260).fill(100)), 5)).toBe(255);
    expect(countOverlappingSamples(makeSeries(new Array(10).fill(100)), 30)).toBe(0);
  });
});

describe('filterStrictlyBefore', () => {
  it('3.3 asOfDate is exclusive', () => {
    const series = makeSeries([1, 2, 3, 4, 5], '2024-01-01');
    const filtered = filterStrictlyBefore(series, '2024-01-03');
    expect(filtered.map((p) => p.date)).toEqual(['2024-01-01', '2024-01-02']);
  });
});

// ─── Provider-driven async tests ─────────────────────────────────────────────

function makeProvider(opts: {
  market: Market | null;
  tickerSeries: PriceSeriesPoint[];
  indexSeries?: PriceSeriesPoint[];
}): VolatilityProvider & { calls: { getSeries: number; getMarket: number } } {
  const calls = { getSeries: 0, getMarket: 0 };
  return {
    calls,
    async getMarket() {
      calls.getMarket++;
      return opts.market;
    },
    async getSeries(ticker) {
      calls.getSeries++;
      if (ticker === '^TWII' || ticker === 'SPY') return opts.indexSeries ?? [];
      return opts.tickerSeries;
    },
  };
}

function bigSeries(n: number, startDate = '2020-01-01'): PriceSeriesPoint[] {
  // Random-ish but deterministic walk
  const closes: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p *= 1 + ((i * 37) % 13) / 1000 - 0.006;
    closes.push(p);
  }
  return makeSeries(closes, startDate);
}

describe('getVolatilityThreshold', () => {
  beforeEach(() => __resetVolatilityCache());

  it('3.4 insufficient ticker history triggers index fallback', async () => {
    const provider = makeProvider({
      market: 'US',
      tickerSeries: bigSeries(20, '2024-01-01'), // way too short for 30d window
      indexSeries: bigSeries(400, '2023-01-01'),
    });
    const result = await getVolatilityThreshold({
      ticker: 'IPO',
      periodDays: 30,
      asOfDate: new Date('2024-12-31'),
      provider,
      cache: new VolatilityCache(),
    });
    expect(result.source).toBe('index-fallback');
    expect(result.ticker).toBe('SPY');
    expect(result.value).toBeGreaterThan(0);
  });

  it('3.5 sufficient history uses ticker', async () => {
    const provider = makeProvider({
      market: 'US',
      tickerSeries: bigSeries(400, '2023-01-01'),
    });
    const result = await getVolatilityThreshold({
      ticker: 'AAPL',
      periodDays: 30,
      asOfDate: new Date('2024-12-31'),
      provider,
      cache: new VolatilityCache(),
    });
    expect(result.source).toBe('ticker');
    expect(result.ticker).toBe('AAPL');
  });

  it('3.6 HK market raises UnsupportedMarketError', async () => {
    const provider = makeProvider({ market: 'HK', tickerSeries: [] });
    await expect(
      getVolatilityThreshold({
        ticker: '0700',
        periodDays: 30,
        asOfDate: new Date('2024-12-31'),
        provider,
        cache: new VolatilityCache(),
      })
    ).rejects.toBeInstanceOf(UnsupportedMarketError);
  });

  it('3.7 cache hit does not re-invoke provider', async () => {
    const provider = makeProvider({
      market: 'US',
      tickerSeries: bigSeries(400, '2023-01-01'),
    });
    const cache = new VolatilityCache();
    const args = {
      ticker: 'AAPL',
      periodDays: 30 as const,
      asOfDate: new Date('2024-12-31'),
      provider,
      cache,
    };
    await getVolatilityThreshold(args);
    const firstSeriesCalls = provider.calls.getSeries;
    const firstMarketCalls = provider.calls.getMarket;
    await getVolatilityThreshold(args);
    expect(provider.calls.getSeries).toBe(firstSeriesCalls);
    expect(provider.calls.getMarket).toBe(firstMarketCalls);
  });
});
