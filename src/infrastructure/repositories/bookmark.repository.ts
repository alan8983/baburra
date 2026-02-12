// Bookmark Repository - 書籤 CRUD

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { Bookmark, BookmarkWithPost } from '@/domain/models';

type DbBookmark = {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
};

function mapDbToBookmark(row: DbBookmark): Bookmark {
  return {
    id: row.id,
    userId: row.user_id,
    postId: row.post_id,
    createdAt: new Date(row.created_at),
  };
}

export async function listBookmarksByUserId(
  userId: string,
  params?: { page?: number; limit?: number }
): Promise<{ data: BookmarkWithPost[]; total: number }> {
  const supabase = createAdminClient();
  const { page = 1, limit = 50 } = params ?? {};

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const {
    data: rows,
    count,
    error,
  } = await supabase
    .from('bookmarks')
    .select('*', { count: 'exact', head: false })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  if (!rows?.length) return { data: [], total: count ?? 0 };

  const bookmarks = (rows as DbBookmark[]).map(mapDbToBookmark);
  const postIds = bookmarks.map((b) => b.postId);

  // Fetch posts with their relations
  const { data: postRows, error: postError } = await supabase
    .from('posts')
    .select('id, kol_id, title, content, sentiment, posted_at')
    .in('id', postIds);

  if (postError) throw new Error(postError.message);

  // Fetch KOL info for posts
  const kolIds = [...new Set((postRows ?? []).map((p) => p.kol_id as string).filter(Boolean))];
  const [kolResult, postStockResult] = await Promise.all([
    kolIds.length
      ? supabase.from('kols').select('id, name, avatar_url').in('id', kolIds)
      : { data: [] },
    postIds.length
      ? supabase.from('post_stocks').select('post_id, stock_id').in('post_id', postIds)
      : { data: [] },
  ]);

  const kolMap: Record<string, { id: string; name: string; avatarUrl: string | null }> = {};
  for (const k of kolResult.data ?? []) {
    kolMap[k.id as string] = {
      id: k.id as string,
      name: k.name as string,
      avatarUrl: (k.avatar_url as string) ?? null,
    };
  }

  // Fetch stock info
  const stockIds = [
    ...new Set((postStockResult.data ?? []).map((ps) => ps.stock_id as string)),
  ];
  const stockResult = stockIds.length
    ? await supabase.from('stocks').select('id, ticker, name').in('id', stockIds)
    : { data: [] };

  const stockMap: Record<string, { id: string; ticker: string; name: string }> = {};
  for (const s of stockResult.data ?? []) {
    stockMap[s.id as string] = {
      id: s.id as string,
      ticker: s.ticker as string,
      name: s.name as string,
    };
  }

  // Build post_id -> stock[] map
  const postStockMap: Record<string, { id: string; ticker: string; name: string }[]> = {};
  for (const ps of postStockResult.data ?? []) {
    const pid = ps.post_id as string;
    const sid = ps.stock_id as string;
    if (!postStockMap[pid]) postStockMap[pid] = [];
    if (stockMap[sid]) postStockMap[pid].push(stockMap[sid]);
  }

  // Build post map
  const postMap: Record<
    string,
    {
      id: string;
      title: string | null;
      content: string;
      sentiment: number;
      postedAt: Date;
      kol: { id: string; name: string; avatarUrl: string | null };
      stocks: { id: string; ticker: string; name: string }[];
    }
  > = {};
  for (const p of postRows ?? []) {
    const kolId = p.kol_id as string;
    postMap[p.id as string] = {
      id: p.id as string,
      title: (p.title as string) ?? null,
      content: p.content as string,
      sentiment: p.sentiment as number,
      postedAt: new Date(p.posted_at as string),
      kol: kolMap[kolId] ?? { id: kolId, name: 'Unknown', avatarUrl: null },
      stocks: postStockMap[p.id as string] ?? [],
    };
  }

  const data: BookmarkWithPost[] = bookmarks
    .filter((b) => postMap[b.postId])
    .map((b) => ({
      ...b,
      post: postMap[b.postId],
    }));

  return { data, total: count ?? 0 };
}

export async function isBookmarked(userId: string, postId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .maybeSingle();

  return !!data;
}

export async function addBookmark(userId: string, postId: string): Promise<Bookmark> {
  const supabase = createAdminClient();

  // Check if already bookmarked (handle unique constraint gracefully)
  const { data: existing } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .maybeSingle();

  if (existing) return mapDbToBookmark(existing as DbBookmark);

  const { data: row, error } = await supabase
    .from('bookmarks')
    .insert({ user_id: userId, post_id: postId })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapDbToBookmark(row as DbBookmark);
}

export async function removeBookmark(userId: string, postId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId);

  if (error) throw new Error(error.message);
  return true;
}
