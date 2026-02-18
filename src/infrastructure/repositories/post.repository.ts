// Post Repository - 文章 CRUD

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type {
  Post,
  PostWithRelations,
  PostWithPriceChanges,
  CreatePostInput,
  UpdatePostInput,
  PriceChangeByPeriod,
} from '@/domain/models';

type DbPost = {
  id: string;
  kol_id: string;
  title: string | null;
  content: string;
  source_url: string | null;
  source_platform: string;
  images: string[];
  sentiment: number;
  sentiment_ai_generated: boolean;
  posted_at: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

function mapDbToPost(row: DbPost): Post {
  return {
    id: row.id,
    kolId: row.kol_id,
    title: row.title ?? null,
    content: row.content,
    sourceUrl: row.source_url ?? null,
    sourcePlatform: row.source_platform as Post['sourcePlatform'],
    images: Array.isArray(row.images) ? row.images : [],
    sentiment: row.sentiment as Post['sentiment'],
    sentimentAiGenerated: row.sentiment_ai_generated ?? false,
    postedAt: new Date(row.posted_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by ?? null,
  };
}

export async function listPosts(params: {
  search?: string;
  kolId?: string;
  stockTicker?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: PostWithPriceChanges[]; total: number }> {
  const supabase = createAdminClient();
  const { search = '', kolId, stockTicker, page = 1, limit = 20 } = params;

  // stockTicker 篩選仍需要預查詢
  let stockFilterPostIds: string[] | null = null;
  if (stockTicker) {
    const { data: stock } = await supabase
      .from('stocks')
      .select('id')
      .eq('ticker', stockTicker)
      .single();
    if (!stock?.id) return { data: [], total: 0 };
    const { data: postIds } = await supabase
      .from('post_stocks')
      .select('post_id')
      .eq('stock_id', stock.id);
    const ids = (postIds ?? []).map((p) => p.post_id as string);
    if (ids.length === 0) return { data: [], total: 0 };
    stockFilterPostIds = ids;
  }

  // 使用 FK embedding 一次查詢取得文章 + KOL + 股票
  let query = supabase
    .from('posts')
    .select(`*, kols(id, name, avatar_url), post_stocks(stock_id, stocks(id, ticker, name))`, {
      count: 'exact',
    });

  if (kolId) query = query.eq('kol_id', kolId);
  if (stockFilterPostIds) query = query.in('id', stockFilterPostIds);
  if (search.trim()) {
    query = query.or(`content.ilike.%${search.trim()}%,title.ilike.%${search.trim()}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const {
    data: rows,
    count,
    error,
  } = await query.order('posted_at', { ascending: false }).range(from, to);

  if (error) throw new Error(error.message);
  if (!rows?.length) return { data: [], total: count ?? 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: PostWithPriceChanges[] = rows.map((row: any) => {
    const post = mapDbToPost(row as DbPost);
    const kol = row.kols
      ? {
          id: row.kols.id as string,
          name: row.kols.name as string,
          avatarUrl: (row.kols.avatar_url as string) ?? null,
        }
      : { id: post.kolId, name: '', avatarUrl: null };
    const stocks = (row.post_stocks ?? [])
      .map((ps: any) => ps.stocks) // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter(Boolean)
      .map((s: any) => ({
        // eslint-disable-line @typescript-eslint/no-explicit-any
        id: s.id as string,
        ticker: s.ticker as string,
        name: s.name as string,
      }));
    return {
      ...post,
      kol,
      stocks,
      priceChanges: {} as Record<string, PriceChangeByPeriod>,
    };
  });

  return { data, total: count ?? 0 };
}

export async function getPostById(id: string): Promise<PostWithPriceChanges | null> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('posts')
    .select(`*, kols(id, name, avatar_url), post_stocks(stock_id, stocks(id, ticker, name))`)
    .eq('id', id)
    .single();
  if (error || !row) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any;
  const post = mapDbToPost(r as DbPost);
  const kol = r.kols
    ? {
        id: r.kols.id as string,
        name: r.kols.name as string,
        avatarUrl: (r.kols.avatar_url as string) ?? null,
      }
    : { id: post.kolId, name: '', avatarUrl: null };
  const stocks = (r.post_stocks ?? [])
    .map((ps: any) => ps.stocks) // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter(Boolean)
    .map((s: any) => ({
      // eslint-disable-line @typescript-eslint/no-explicit-any
      id: s.id as string,
      ticker: s.ticker as string,
      name: s.name as string,
    }));

  return { ...post, kol, stocks, priceChanges: {} };
}

export async function createPost(input: CreatePostInput, createdBy: string | null): Promise<Post> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('posts')
    .insert({
      kol_id: input.kolId,
      title: input.title ?? null,
      content: input.content,
      source_url: input.sourceUrl ?? null,
      source_platform: input.sourcePlatform,
      images: input.images ?? [],
      sentiment: input.sentiment,
      sentiment_ai_generated: input.sentimentAiGenerated ?? false,
      posted_at: input.postedAt instanceof Date ? input.postedAt.toISOString() : input.postedAt,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  const post = mapDbToPost(row as DbPost);

  if (input.stockIds?.length) {
    await supabase
      .from('post_stocks')
      .insert(input.stockIds.map((stock_id) => ({ post_id: post.id, stock_id })));
  }

  return post;
}

export async function updatePost(id: string, input: UpdatePostInput): Promise<Post | null> {
  const supabase = createAdminClient();
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.content !== undefined) payload.content = input.content;
  if (input.sentiment !== undefined) payload.sentiment = input.sentiment;
  if (input.images !== undefined) payload.images = input.images;
  if (Object.keys(payload).length === 0) {
    const p = await getPostById(id);
    return p ? { ...p } : null;
  }

  const { data: row, error } = await supabase
    .from('posts')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row ? mapDbToPost(row as DbPost) : null;
}

export async function deletePost(id: string): Promise<boolean> {
  const supabase = createAdminClient();
  await supabase.from('post_stocks').delete().eq('post_id', id);
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

export async function findPostBySourceUrl(sourceUrl: string): Promise<PostWithRelations | null> {
  if (!sourceUrl?.trim()) return null;
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('posts')
    .select('*')
    .eq('source_url', sourceUrl.trim())
    .maybeSingle();

  if (error || !row) return null;
  const post = mapDbToPost(row as DbPost);
  const { data: kol } = await supabase
    .from('kols')
    .select('id, name, avatar_url')
    .eq('id', post.kolId)
    .single();
  const { data: psRows } = await supabase
    .from('post_stocks')
    .select('stock_id')
    .eq('post_id', post.id);
  const stockIds = (psRows ?? []).map((p) => p.stock_id as string);
  let stocks: PostWithRelations['stocks'] = [];
  if (stockIds.length > 0) {
    const { data: sRows } = await supabase
      .from('stocks')
      .select('id, ticker, name')
      .in('id', stockIds);
    stocks = (sRows ?? []).map((s) => ({
      id: s.id as string,
      ticker: s.ticker as string,
      name: s.name as string,
    }));
  }

  return {
    ...post,
    kol: kol
      ? {
          id: kol.id as string,
          name: kol.name as string,
          avatarUrl: (kol.avatar_url as string) ?? null,
        }
      : { id: post.kolId, name: '', avatarUrl: null },
    stocks,
  };
}
