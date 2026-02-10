'use client';

// Dashboard 相關 hooks

import { useQuery } from '@tanstack/react-query';
import type { PostWithPriceChanges } from '@/domain/models';
import { API_ROUTES } from '@/lib/constants';

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
  name: string;
  postCount: number;
  lastPostAt: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  recentPosts: PostWithPriceChanges[];
  topKols: TopKol[];
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
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      return res.json();
    },
    staleTime: 30_000, // 30 秒內不重複請求
  });
}
