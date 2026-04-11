'use client';

// Dashboard 相關 hooks

import { useQuery } from '@tanstack/react-query';
import type { PostWithPriceChanges } from '@/domain/models';
import type { WinRateStats } from '@/domain/calculators';
import { API_ROUTES } from '@/lib/constants';
import { throwIfNotOk } from '@/lib/api/fetch-error';

// Dashboard 資料型別
export interface DashboardStats {
  kolCount: number;
  kolMonthlyNew: number;
  stockCount: number;
  stockMonthlyNew: number;
  postCount: number;
  postWeeklyNew: number;
  draftCount: number;
  draftLastUpdated: string | null;
}

export interface TopKol {
  id: string;
  name: string;
  postCount: number;
  lastPostAt: string | null;
}

export interface KolWinRateEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Full per-period stats; consumers pick a bucket based on the user's selected period. */
  stats: WinRateStats;
}

export interface DashboardData {
  stats: DashboardStats;
  recentPosts: PostWithPriceChanges[];
  topKols: TopKol[];
  /** Full per-period win-rate stats aggregated across recentPosts. */
  pulseStats: WinRateStats;
  /** Per-KOL full per-period win-rate stats, computed across recentPosts. */
  kolWinRates: KolWinRateEntry[];
}

// Query Keys
export const dashboardKeys = {
  all: ['dashboard'] as const,
};

// 取得 Dashboard 資料
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async (): Promise<DashboardData> => {
      const res = await fetch(API_ROUTES.DASHBOARD);
      await throwIfNotOk(res);
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 分鐘 - 與全域預設一致
    gcTime: 10 * 60 * 1000,
  });
}
