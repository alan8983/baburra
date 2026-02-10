// GET /api/dashboard - Dashboard 統計資料

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { listKols } from '@/infrastructure/repositories/kol.repository';
import type { PostWithPriceChanges } from '@/domain/models';

// 計算本月開始時間（UTC）
function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// 計算本週開始時間（週一，UTC）
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1); // 調整到週一
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const supabase = createAdminClient();

    const monthStart = getMonthStart();
    const weekStart = getWeekStart();

    // 平行查詢所有統計資料
    const [
      kolTotalResult,
      kolMonthlyResult,
      stockTotalResult,
      stockMonthlyResult,
      postTotalResult,
      postWeeklyResult,
      draftsResult,
      recentPostsResult,
      allKolsResult,
    ] = await Promise.all([
      // KOL 總數
      supabase.from('kols').select('id', { count: 'exact', head: true }),
      // KOL 本月新增
      supabase
        .from('kols')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart.toISOString()),
      // 投資標的總數
      supabase.from('stocks').select('id', { count: 'exact', head: true }),
      // 投資標的本月新增
      supabase
        .from('stocks')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart.toISOString()),
      // 文章總數
      supabase.from('posts').select('id', { count: 'exact', head: true }),
      // 文章本週新增
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekStart.toISOString()),
      // 草稿統計（需要 user_id）
      userId
        ? supabase
            .from('drafts')
            .select('updated_at', { count: 'exact', head: false })
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [], count: 0, error: null }),
      // 最近 5 篇文章
      listPosts({ limit: 5 }),
      // 所有 KOL（用於排序）
      listKols({ limit: 1000 }), // 取得足夠的 KOL 來排序
    ]);

    // 處理錯誤
    if (kolTotalResult.error) throw kolTotalResult.error;
    if (kolMonthlyResult.error) throw kolMonthlyResult.error;
    if (stockTotalResult.error) throw stockTotalResult.error;
    if (stockMonthlyResult.error) throw stockMonthlyResult.error;
    if (postTotalResult.error) throw postTotalResult.error;
    if (postWeeklyResult.error) throw postWeeklyResult.error;
    if (draftsResult.error) throw draftsResult.error;

    // 取得草稿最近更新時間
    const draftLastUpdated =
      draftsResult.data && draftsResult.data.length > 0
        ? (draftsResult.data[0] as { updated_at: string }).updated_at
        : null;

    // 取得前 5 名 KOL（按文章數排序）
    const topKols = allKolsResult.data
      .sort((a, b) => (b.postCount ?? 0) - (a.postCount ?? 0))
      .slice(0, 5)
      .map((kol) => ({
        name: kol.name,
        postCount: kol.postCount ?? 0,
        lastPostAt: kol.lastPostAt?.toISOString() ?? null,
      }));

    return NextResponse.json({
      stats: {
        kolCount: kolTotalResult.count ?? 0,
        kolMonthlyNew: kolMonthlyResult.count ?? 0,
        stockCount: stockTotalResult.count ?? 0,
        stockMonthlyNew: stockMonthlyResult.count ?? 0,
        postCount: postTotalResult.count ?? 0,
        postWeeklyNew: postWeeklyResult.count ?? 0,
        draftCount: draftsResult.count ?? 0,
        draftLastUpdated,
      },
      recentPosts: recentPostsResult.data ?? [],
      topKols,
    });
  } catch (err) {
    console.error('GET /api/dashboard', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
