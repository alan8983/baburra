import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersistentVolatilityProvider } from './persistent-volatility.provider';
import {
  getVolatilityThreshold,
  VolatilityCache,
  type PriceSeriesPoint,
  type VolatilityResult,
} from '@/domain/calculators';

// Hoist the mock state so the module mock can see it.
const { thresholdStore, stockPriceMocks } = vi.hoisted(() => ({
  thresholdStore: {
    get: vi.fn<(ticker: string, periodDays: number, asOfDate: string) => unknown>(),
    upsert: vi.fn<(row: unknown) => Promise<void>>(),
  },
  stockPriceMocks: {
    getStockPriceSeries:
      vi.fn<(ticker: string, opts: { from: string; to: string }) => Promise<PriceSeriesPoint[]>>(),
    getStockMarket: vi.fn<(ticker: string) => Promise<string | null>>(),
  },
}));

vi.mock('@/infrastructure/repositories/volatility-threshold.repository', () => ({
  getThreshold: (...args: unknown[]) =>
    Promise.resolve(
      thresholdStore.get(...(args as [string, number, string])) as VolatilityResult | null
    ),
  upsertThreshold: (...args: unknown[]) => Promise.resolve(thresholdStore.upsert(args[0])),
}));

vi.mock('@/infrastructure/repositories/stock-price.repository', () => ({
  getStockPriceSeries: (ticker: string, opts: { from: string; to: string }) =>
    stockPriceMocks.getStockPriceSeries(ticker, opts),
  getStockMarket: (ticker: string) => stockPriceMocks.getStockMarket(ticker),
}));

function bigSeries(n: number, startDate = '2020-01-01'): PriceSeriesPoint[] {
  const start = new Date(startDate);
  const closes: number[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p *= 1 + ((i * 37) % 13) / 1000 - 0.006;
    closes.push(p);
  }
  return closes.map((close, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

describe('PersistentVolatilityProvider', () => {
  beforeEach(() => {
    thresholdStore.get.mockReset();
    thresholdStore.upsert.mockReset();
    stockPriceMocks.getStockPriceSeries.mockReset();
    stockPriceMocks.getStockMarket.mockReset();
  });

  it('cache hit (L2) short-circuits compute; no series fetch', async () => {
    thresholdStore.get.mockReturnValue({
      ticker: 'AAPL',
      periodDays: 30,
      asOfDate: '2024-12-30',
      value: 0.042,
      source: 'ticker',
      sampleSize: 250,
    });
    stockPriceMocks.getStockMarket.mockResolvedValue('US');
    stockPriceMocks.getStockPriceSeries.mockResolvedValue([]);

    const provider = new PersistentVolatilityProvider();
    const result = await getVolatilityThreshold({
      ticker: 'AAPL',
      periodDays: 30,
      asOfDate: new Date('2024-12-31'),
      provider,
      cache: new VolatilityCache(),
    });

    expect(result.value).toBe(0.042);
    expect(result.source).toBe('ticker');
    expect(stockPriceMocks.getStockPriceSeries).not.toHaveBeenCalled();
    expect(stockPriceMocks.getStockMarket).not.toHaveBeenCalled();
    expect(thresholdStore.upsert).not.toHaveBeenCalled();
  });

  it('cache miss triggers compute and then upserts the L2 row', async () => {
    thresholdStore.get.mockReturnValue(null);
    stockPriceMocks.getStockMarket.mockResolvedValue('US');
    stockPriceMocks.getStockPriceSeries.mockResolvedValue(bigSeries(400, '2023-01-01'));

    const provider = new PersistentVolatilityProvider();
    const result = await getVolatilityThreshold({
      ticker: 'AAPL',
      periodDays: 30,
      asOfDate: new Date('2024-12-31'),
      provider,
      cache: new VolatilityCache(),
    });

    expect(result.source).toBe('ticker');
    expect(stockPriceMocks.getStockPriceSeries).toHaveBeenCalled();
    expect(thresholdStore.upsert).toHaveBeenCalledTimes(1);
    const [row] = thresholdStore.upsert.mock.calls[0] as [Record<string, unknown>];
    expect(row.ticker).toBe('AAPL');
    expect(row.periodDays).toBe(30);
    expect(row.asOfDate).toBe('2024-12-31');
    expect(typeof row.value).toBe('number');
  });

  it('swallows upsert errors without crashing the compute path', async () => {
    thresholdStore.get.mockReturnValue(null);
    thresholdStore.upsert.mockImplementation(async () => {
      throw new Error('db dead');
    });
    stockPriceMocks.getStockMarket.mockResolvedValue('US');
    stockPriceMocks.getStockPriceSeries.mockResolvedValue(bigSeries(400, '2023-01-01'));

    const provider = new PersistentVolatilityProvider();
    const result = await getVolatilityThreshold({
      ticker: 'AAPL',
      periodDays: 30,
      asOfDate: new Date('2024-12-31'),
      provider,
      cache: new VolatilityCache(),
    });

    expect(result.value).toBeGreaterThan(0);
  });
});
