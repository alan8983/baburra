'use client';

// Stock 相關 hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Stock,
  StockWithStats,
  CreateStockInput,
  StockSearchResult,
  CandlestickData,
  PostWithPriceChanges,
} from '@/domain/models';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';

import type { ReturnRateStats, WinRateStats } from '@/domain/calculators';

// Query Keys
export const stockKeys = {
  all: ['stocks'] as const,
  lists: () => [...stockKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...stockKeys.lists(), filters] as const,
  details: () => [...stockKeys.all, 'detail'] as const,
  detail: (ticker: string) => [...stockKeys.details(), ticker] as const,
  posts: (ticker: string, params?: Record<string, unknown>) =>
    [...stockKeys.detail(ticker), 'posts', params] as const,
  returnRate: (ticker: string) => [...stockKeys.detail(ticker), 'return-rate'] as const,
  winRate: (ticker: string) => [...stockKeys.detail(ticker), 'win-rate'] as const,
  search: (query: string) => [...stockKeys.all, 'search', query] as const,
  prices: (ticker: string, params?: Record<string, unknown>) =>
    [...stockKeys.all, 'prices', ticker, params] as const,
};

// 取得 Stock 列表
export function useStocks(params?: { search?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: stockKeys.list(params ?? {}),
    queryFn: async (): Promise<{ data: StockWithStats[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());

      const url = `${API_ROUTES.STOCKS}?${searchParams.toString()}`;
      const res = await fetch(url);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

// 取得單一 Stock 詳情
export function useStock(ticker: string) {
  return useQuery({
    queryKey: stockKeys.detail(ticker),
    queryFn: async (): Promise<StockWithStats> => {
      const res = await fetch(API_ROUTES.STOCK_DETAIL(ticker));
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 1 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
  });
}

// 搜尋 Stock (用於 Selector)
export function useStockSearch(query: string) {
  return useQuery({
    queryKey: stockKeys.search(query),
    queryFn: async (): Promise<StockSearchResult[]> => {
      const res = await fetch(`${API_ROUTES.STOCKS}?search=${encodeURIComponent(query)}&limit=10`);
      await throwIfNotOk(res);
      const { data } = await res.json();
      return data;
    },
    enabled: query.length >= 1,
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

// 取得標的相關文章列表
export function useStockPosts(ticker: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: stockKeys.posts(ticker, params),
    queryFn: async (): Promise<{ data: PostWithPriceChanges[]; total: number }> => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      const url = `${API_ROUTES.STOCK_POSTS(ticker)}?${searchParams.toString()}`;
      const res = await fetch(url);
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 2 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

// 取得股價資料
export function useStockPrices(ticker: string, params?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: stockKeys.prices(ticker, params),
    queryFn: async (): Promise<CandlestickData[]> => {
      const searchParams = new URLSearchParams();
      if (params?.startDate) searchParams.set('startDate', params.startDate);
      if (params?.endDate) searchParams.set('endDate', params.endDate);

      const url = `${API_ROUTES.STOCK_PRICES(ticker)}?${searchParams.toString()}`;
      const res = await fetch(url);
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// 建立 Stock
export function useCreateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateStockInput): Promise<Stock> => {
      const res = await fetch(API_ROUTES.STOCKS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await throwIfNotOk(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.lists() });
    },
  });
}

// 取得標的報酬率統計
export function useStockReturnRate(ticker: string) {
  return useQuery({
    queryKey: stockKeys.returnRate(ticker),
    queryFn: async (): Promise<ReturnRateStats> => {
      const res = await fetch(API_ROUTES.STOCK_RETURN_RATE(ticker));
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000, // 5 分鐘內不重新請求
    gcTime: 10 * 60 * 1000,
  });
}

// 取得標的勝率統計（動態 1σ 門檻）
export function useStockWinRate(ticker: string) {
  return useQuery({
    queryKey: stockKeys.winRate(ticker),
    queryFn: async (): Promise<WinRateStats> => {
      const res = await fetch(API_ROUTES.STOCK_WIN_RATE(ticker));
      await throwIfNotOk(res);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Stock-level scorecard (pre-aggregated Return + Hit Rate + SQR + per-KOL
 * breakdown). Read-through cache at `/api/stocks/[ticker]/scorecard`. Returns
 * `null` when the server is still computing; React Query polls until ready.
 */
export function useStockScorecard(ticker: string) {
  return useQuery({
    queryKey: [...stockKeys.detail(ticker), 'scorecard'] as const,
    queryFn: async (): Promise<
      (WinRateStats & { bucketsByKol?: Record<string, WinRateStats> }) | null
    > => {
      const res = await fetch(API_ROUTES.STOCK_SCORECARD(ticker));
      await throwIfNotOk(res);
      const json = (await res.json()) as
        | (WinRateStats & {
            status?: 'ready';
            computedAt?: string;
            bucketsByKol?: Record<string, WinRateStats>;
          })
        | { status: 'computing'; computedAt: null };
      if ('status' in json && json.status === 'computing') return null;
      const raw = json as WinRateStats & {
        status?: 'ready';
        computedAt?: string;
        bucketsByKol?: Record<string, WinRateStats>;
      };
      const { status, computedAt, ...stats } = raw;
      void status;
      void computedAt;
      return stats;
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: (query) => (query.state.data === null ? 3000 : false),
  });
}
