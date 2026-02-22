/**
 * 股價查詢 Hook（供 Chart 使用）
 * 呼叫 GET /api/stocks/[ticker]/prices?includeVolumes=1，回傳 candles + volumes。
 * 不修改 use-stocks 的 list/detail 邏輯；既有 useStockPrices 仍用於僅需 K 線的場景。
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import type { CandlestickData, VolumeData } from '@/domain/models/stock';
import { API_ROUTES } from '@/lib/constants';

const stockPricesChartKeys = {
  all: ['stockPricesChart'] as const,
  detail: (ticker: string, params?: Record<string, unknown>) =>
    [...stockPricesChartKeys.all, ticker, params] as const,
};

export interface StockPricesChartResult {
  candles: CandlestickData[];
  volumes: VolumeData[];
}

export function useStockPricesForChart(
  ticker: string,
  params?: { startDate?: string; endDate?: string }
) {
  return useQuery({
    queryKey: stockPricesChartKeys.detail(ticker, params),
    queryFn: async (): Promise<StockPricesChartResult> => {
      const searchParams = new URLSearchParams({ includeVolumes: '1' });
      if (params?.startDate) searchParams.set('startDate', params.startDate);
      if (params?.endDate) searchParams.set('endDate', params.endDate);
      const url = `${API_ROUTES.STOCK_PRICES(ticker)}?${searchParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch stock prices');
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
