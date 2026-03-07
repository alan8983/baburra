// Insight Repository — anonymous aggregation queries for community insights

import { createAdminClient } from '@/infrastructure/supabase/admin';

// ── Types ──

export interface TrendingStock {
  stockId: string;
  ticker: string;
  name: string;
  postCount: number;
}

export interface PopularKol {
  kolId: string;
  name: string;
  avatarUrl: string | null;
  followerCount: number;
}

// ── DB row types (snake_case from RPC) ──

type DbTrendingStock = {
  stock_id: string;
  ticker: string;
  name: string;
  post_count: number;
};

type DbPopularKol = {
  kol_id: string;
  name: string;
  avatar_url: string | null;
  follower_count: number;
};

// ── Repository functions ──

export async function getTrendingStocks(
  days: number = 7,
  limit: number = 10
): Promise<TrendingStock[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('get_trending_stocks', {
    p_days: days,
    p_limit: limit,
  });

  if (error) throw new Error(error.message);

  return (data as DbTrendingStock[]).map((row) => ({
    stockId: row.stock_id,
    ticker: row.ticker,
    name: row.name,
    postCount: Number(row.post_count),
  }));
}

export async function getPopularKols(limit: number = 10): Promise<PopularKol[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('get_popular_kols', {
    p_limit: limit,
  });

  if (error) throw new Error(error.message);

  return (data as DbPopularKol[]).map((row) => ({
    kolId: row.kol_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    followerCount: Number(row.follower_count),
  }));
}

export async function getKolFollowerCount(kolId: string): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('get_kol_follower_count', {
    p_kol_id: kolId,
  });

  if (error) throw new Error(error.message);

  return Number(data ?? 0);
}
