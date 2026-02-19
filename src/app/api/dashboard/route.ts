// GET /api/dashboard - Dashboard 統計資料

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { listPosts } from '@/infrastructure/repositories/post.repository';
import { internalError } from '@/lib/api/error';

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

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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
      postKolIdsResult,
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
      supabase
        .from('drafts')
        .select('updated_at', { count: 'exact', head: false })
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1),
      // 最近 5 篇文章
      listPosts({ limit: 5 }),
      // 取得所有文章的 kol_id（輕量查詢，只取一欄）
      supabase.from('posts').select('kol_id'),
    ]);

    // 處理錯誤
    if (kolTotalResult.error) throw kolTotalResult.error;
    if (kolMonthlyResult.error) throw kolMonthlyResult.error;
    if (stockTotalResult.error) throw stockTotalResult.error;
    if (stockMonthlyResult.error) throw stockMonthlyResult.error;
    if (postTotalResult.error) throw postTotalResult.error;
    if (postWeeklyResult.error) throw postWeeklyResult.error;
    if (draftsResult.error) throw draftsResult.error;
    if (postKolIdsResult.error) throw postKolIdsResult.error;

    // 取得草稿最近更新時間
    const draftLastUpdated =
      draftsResult.data && draftsResult.data.length > 0
        ? (draftsResult.data[0] as { updated_at: string }).updated_at
        : null;

    // 取得前 5 名 KOL（按文章數排序）— 在 JS 中聚合輕量 kol_id 列表
    const postsByKol: Record<string, number> = {};
    for (const p of postKolIdsResult.data ?? []) {
      const kid = p.kol_id as string;
      postsByKol[kid] = (postsByKol[kid] ?? 0) + 1;
    }
    const topKolIds = Object.entries(postsByKol)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);

    let topKols: Array<{ name: string; postCount: number; lastPostAt: string | null }> = [];
    if (topKolIds.length > 0) {
      const [kolNamesResult, lastPostsResult] = await Promise.all([
        supabase.from('kols').select('id, name').in('id', topKolIds),
        supabase
          .from('posts')
          .select('kol_id, posted_at')
          .in('kol_id', topKolIds)
          .order('posted_at', { ascending: false }),
      ]);

      const kolNameMap: Record<string, string> = {};
      for (const k of kolNamesResult.data ?? []) {
        kolNameMap[k.id as string] = k.name as string;
      }
      const lastPostByKol: Record<string, string> = {};
      for (const p of lastPostsResult.data ?? []) {
        const kid = p.kol_id as string;
        if (!lastPostByKol[kid]) lastPostByKol[kid] = p.posted_at as string;
      }

      topKols = topKolIds.map((id) => ({
        name: kolNameMap[id] ?? '',
        postCount: postsByKol[id],
        lastPostAt: lastPostByKol[id] ?? null,
      }));
    }

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
    return internalError(err, 'Failed to fetch dashboard data');
  }
}
