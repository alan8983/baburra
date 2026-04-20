// Bookmark Repository - 書籤 CRUD
// listBookmarksByUserId uses a single nested select (1 query vs the previous 5).

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { Bookmark, BookmarkWithPost } from '@/domain/models';

type DbBookmark = {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
};

type DbBookmarkWithPost = DbBookmark & {
  post: {
    id: string;
    title: string | null;
    content: string;
    sentiment: number;
    posted_at: string;
    kol: {
      id: string;
      name: string;
      avatar_url: string | null;
    } | null;
    post_stocks: {
      stocks: {
        id: string;
        ticker: string;
        name: string;
      } | null;
    }[];
  } | null;
};

function mapDbToBookmark(row: DbBookmark): Bookmark {
  return {
    id: row.id,
    userId: row.user_id,
    postId: row.post_id,
    createdAt: new Date(row.created_at),
  };
}

function mapDbToBookmarkWithPost(row: DbBookmarkWithPost): BookmarkWithPost | null {
  if (!row.post) return null;
  return {
    ...mapDbToBookmark(row),
    post: {
      id: row.post.id,
      title: row.post.title ?? null,
      content: row.post.content,
      sentiment: row.post.sentiment,
      postedAt: new Date(row.post.posted_at),
      kol: row.post.kol
        ? {
            id: row.post.kol.id,
            name: row.post.kol.name,
            avatarUrl: row.post.kol.avatar_url ?? null,
          }
        : { id: '', name: 'Unknown', avatarUrl: null },
      stocks: row.post.post_stocks
        .map((ps) => ps.stocks)
        .filter((s): s is NonNullable<typeof s> => s !== null),
    },
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
    .select(
      `*, post:posts!inner (
        id, title, content, sentiment, posted_at,
        kol:kols (id, name, avatar_url),
        post_stocks (stocks (id, ticker, name))
      )`,
      { count: 'exact', head: false }
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  if (!rows?.length) return { data: [], total: count ?? 0 };

  const data: BookmarkWithPost[] = (rows as DbBookmarkWithPost[])
    .map(mapDbToBookmarkWithPost)
    .filter((b): b is BookmarkWithPost => b !== null);

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

  // Atomic upsert — avoids check-then-insert race condition
  const { data: row, error } = await supabase
    .from('bookmarks')
    .upsert({ user_id: userId, post_id: postId }, { onConflict: 'user_id,post_id' })
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
