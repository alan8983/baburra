// Post Repository - 文章 CRUD

import { createAdminClient } from '@/infrastructure/supabase/admin';
import { escapePostgrestSearch } from '@/lib/api/search';
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
  ai_model_version: string | null;
  posted_at: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

type DbStock = {
  id: string;
  ticker: string;
  name: string;
};

type DbPostStock = {
  stock_id: string;
  sentiment: number | null;
  stocks: DbStock | null;
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
    aiModelVersion: row.ai_model_version ?? null,
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
    .select(
      `*, kols(id, name, avatar_url), post_stocks(stock_id, sentiment, stocks(id, ticker, name))`,
      { count: 'exact' }
    );

  if (kolId) query = query.eq('kol_id', kolId);
  if (stockFilterPostIds) query = query.in('id', stockFilterPostIds);
  if (search.trim()) {
    const s = escapePostgrestSearch(search.trim());
    query = query.or(`content.ilike.%${s}%,title.ilike.%${s}%`);
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

  const data: PostWithPriceChanges[] = (
    rows as (DbPost & {
      kols: { id: string; name: string; avatar_url: string | null } | null;
      post_stocks: DbPostStock[];
    })[]
  ).map((row) => {
    const post = mapDbToPost(row);
    const kol = row.kols
      ? {
          id: row.kols.id,
          name: row.kols.name,
          avatarUrl: row.kols.avatar_url ?? null,
        }
      : { id: post.kolId, name: '', avatarUrl: null };
    const stocks = (row.post_stocks ?? [])
      .filter((ps) => ps.stocks !== null)
      .map((ps) => ({
        id: ps.stocks!.id,
        ticker: ps.stocks!.ticker,
        name: ps.stocks!.name,
        sentiment: (ps.sentiment as Post['sentiment'] | null) ?? null,
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
    .select(
      `*, kols(id, name, avatar_url), post_stocks(stock_id, sentiment, stocks(id, ticker, name))`
    )
    .eq('id', id)
    .single();
  if (error || !row) return null;

  const r = row as DbPost & {
    kols: { id: string; name: string; avatar_url: string | null } | null;
    post_stocks: DbPostStock[];
  };
  const post = mapDbToPost(r);
  const kol = r.kols
    ? {
        id: r.kols.id,
        name: r.kols.name,
        avatarUrl: r.kols.avatar_url ?? null,
      }
    : { id: post.kolId, name: '', avatarUrl: null };
  const stocks = (r.post_stocks ?? [])
    .filter((ps) => ps.stocks !== null)
    .map((ps) => ({
      id: ps.stocks!.id,
      ticker: ps.stocks!.ticker,
      name: ps.stocks!.name,
      sentiment: (ps.sentiment as Post['sentiment'] | null) ?? null,
    }));

  return { ...post, kol, stocks, priceChanges: {} };
}

export async function createPost(input: CreatePostInput, createdBy: string | null): Promise<Post> {
  const supabase = createAdminClient();

  // Build stock array for RPC
  const stocksParam = (input.stockIds ?? []).map((stockId) => ({
    stock_id: stockId,
    sentiment: input.stockSentiments?.[stockId] ?? null,
  }));

  // Build arguments array for RPC (resolve ticker → stock_id)
  let argumentsParam: unknown[] = [];
  if (input.draftAiArguments?.length && input.stockIds?.length) {
    // Look up ticker → stockId mapping
    const { data: stockRows } = await supabase
      .from('stocks')
      .select('id, ticker')
      .in('id', input.stockIds);

    const tickerToStockId: Record<string, string> = {};
    for (const s of stockRows ?? []) {
      tickerToStockId[(s.ticker as string).toUpperCase()] = s.id as string;
    }

    argumentsParam = input.draftAiArguments
      .filter((g) => tickerToStockId[g.ticker.toUpperCase()])
      .map((g) => ({
        ticker: g.ticker,
        arguments: g.arguments.map((arg) => ({
          stock_id: tickerToStockId[g.ticker.toUpperCase()],
          category_code: arg.categoryCode,
          original_text: arg.originalText,
          summary: arg.summary,
          sentiment: arg.sentiment,
          confidence: arg.confidence,
        })),
      }));
  }

  const postedAtStr =
    input.postedAt instanceof Date ? input.postedAt.toISOString() : input.postedAt;

  // Call atomic RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc('create_post_atomic', {
    p_kol_id: input.kolId,
    p_title: input.title ?? null,
    p_content: input.content,
    p_source_url: input.sourceUrl ?? null,
    p_source_platform: input.sourcePlatform,
    p_images: input.images ?? [],
    p_sentiment: input.sentiment,
    p_sentiment_ai_generated: input.sentimentAiGenerated ?? false,
    p_posted_at: postedAtStr,
    p_created_by: createdBy,
    p_stocks: stocksParam,
    p_arguments: argumentsParam,
    p_ai_model_version: input.aiModelVersion ?? null,
  });

  if (rpcError) throw new Error(rpcError.message);

  // RPC returns the post row as JSONB
  const row = rpcData as DbPost;
  return mapDbToPost(row);
}

export async function updatePost(
  id: string,
  userId: string,
  input: UpdatePostInput
): Promise<Post | null> {
  const supabase = createAdminClient();
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.content !== undefined) payload.content = input.content;
  if (input.sentiment !== undefined) payload.sentiment = input.sentiment;
  if (input.images !== undefined) payload.images = input.images;

  if (Object.keys(payload).length > 0) {
    const { data: row, error } = await supabase
      .from('posts')
      .update(payload)
      .eq('id', id)
      .eq('created_by', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!row) return null;
  }

  // Update per-stock sentiments on the junction table
  if (input.stockSentiments) {
    for (const [stockId, sentiment] of Object.entries(input.stockSentiments)) {
      await supabase
        .from('post_stocks')
        .update({ sentiment })
        .eq('post_id', id)
        .eq('stock_id', stockId);
    }
  }

  const p = await getPostById(id);
  return p ? { ...p } : null;
}

export async function updatePostAiAnalysis(
  id: string,
  input: {
    sentiment: number;
    aiModelVersion: string;
    stockSentiments?: Record<string, number>;
  }
): Promise<Post | null> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('posts')
    .update({
      sentiment: input.sentiment,
      sentiment_ai_generated: true,
      ai_model_version: input.aiModelVersion,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!row) return null;

  if (input.stockSentiments) {
    for (const [stockId, sentiment] of Object.entries(input.stockSentiments)) {
      await supabase
        .from('post_stocks')
        .update({ sentiment })
        .eq('post_id', id)
        .eq('stock_id', stockId);
    }
  }

  return mapDbToPost(row as DbPost);
}

export async function deletePost(id: string, userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  // Verify ownership before deleting
  const { data: post } = await supabase
    .from('posts')
    .select('id')
    .eq('id', id)
    .eq('created_by', userId)
    .maybeSingle();
  if (!post) return false;
  await supabase.from('post_stocks').delete().eq('post_id', id);
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

export async function findPostsByModelVersion(
  excludeVersion: string,
  limit: number = 100
): Promise<{ id: string; aiModelVersion: string | null }[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('posts')
    .select('id, ai_model_version')
    .or(`ai_model_version.is.null,ai_model_version.neq.${excludeVersion}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    id: row.id as string,
    aiModelVersion: (row.ai_model_version as string) ?? null,
  }));
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
    .select('stock_id, sentiment')
    .eq('post_id', post.id);
  const psEntries = (psRows ?? []) as { stock_id: string; sentiment: number | null }[];
  const stockIds = psEntries.map((p) => p.stock_id);
  let stocks: PostWithRelations['stocks'] = [];
  if (stockIds.length > 0) {
    const { data: sRows } = await supabase
      .from('stocks')
      .select('id, ticker, name')
      .in('id', stockIds);
    const sentimentMap = new Map(psEntries.map((p) => [p.stock_id, p.sentiment]));
    stocks = (sRows ?? []).map((s) => ({
      id: s.id as string,
      ticker: s.ticker as string,
      name: s.name as string,
      sentiment: (sentimentMap.get(s.id as string) as Post['sentiment'] | null) ?? null,
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
