// Post Repository - 文章 CRUD

import { createAdminClient } from '@/infrastructure/supabase/admin';
import { escapePostgrestSearch } from '@/lib/api/search';
import { invalidateByPost as invalidateWinRateSamplesByPost } from './win-rate-sample.repository';
import { invalidateScorecardsForPost } from './scorecard-cache.repository';
import {
  enqueueKolScorecardCompute,
  enqueueStockScorecardCompute,
} from '@/domain/services/scorecard.service';
import type {
  Post,
  PostWithRelations,
  PostWithPriceChanges,
  CreatePostInput,
  UpdatePostInput,
  PriceChangeByPeriod,
  SourcePlatform,
} from '@/domain/models';

/**
 * Fire-and-forget invalidation of the cached win-rate sample rows whenever a
 * sentiment field is written. See openspec/changes/persist-win-rate-samples
 * (D5) — samples are immutable per `(post_id, stock_id, period_days,
 * classifier_version)` EXCEPT when the classifier's inputs change, which for
 * us means `posts.sentiment` or `post_stocks.sentiment`. Deleting all rows for
 * the post is simpler than per-stock bookkeeping and the next read refills.
 */
async function invalidateSamplesAfterSentimentWrite(postId: string): Promise<void> {
  try {
    await invalidateWinRateSamplesByPost(postId);
  } catch (err) {
    console.warn(
      `[post.repository] win-rate sample invalidation failed for ${postId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Mark the KOL + every referenced Stock's scorecard as stale after a post
 * write. Fire-and-forget — scraper ingestion already pays a Tiingo round-trip
 * later on the read-through path when a user visits, and we log rather than
 * fail hard because the source-of-truth sample rows are the authoritative
 * state.
 */
async function invalidateScorecardsAfterPostWrite(
  kolId: string,
  stockIds: string[]
): Promise<void> {
  try {
    await invalidateScorecardsForPost({ kolId, stockIds });
    // Pre-warm: enqueue the recompute immediately so the next user read hits
    // a fresh cache rather than eating a 30s cold compute. The in-service
    // dedupe lock prevents double-computes if multiple writes land quickly.
    enqueueKolScorecardCompute(kolId);
    for (const stockId of stockIds) enqueueStockScorecardCompute(stockId);
  } catch (err) {
    console.warn(
      `[post.repository] scorecard invalidation failed for ${kolId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

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
  primary_post_id: string | null;
  content_fingerprint: string | null;
};

type DbStock = {
  id: string;
  ticker: string;
  name: string;
};

type DbPostStock = {
  stock_id: string;
  sentiment: number | null;
  source: string | null;
  inference_reason: string | null;
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
    primaryPostId: row.primary_post_id ?? null,
    contentFingerprint: row.content_fingerprint ?? null,
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
      `*, kols(id, name, avatar_url), post_stocks(stock_id, sentiment, source, inference_reason, stocks(id, ticker, name))`,
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
        source: (ps.source as 'explicit' | 'inferred') ?? 'explicit',
        inferenceReason: ps.inference_reason ?? null,
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
      `*, kols(id, name, avatar_url), post_stocks(stock_id, sentiment, source, inference_reason, stocks(id, ticker, name))`
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
      source: (ps.source as 'explicit' | 'inferred') ?? 'explicit',
      inferenceReason: ps.inference_reason ?? null,
    }));

  return { ...post, kol, stocks, priceChanges: {} };
}

export async function createPost(input: CreatePostInput, createdBy: string | null): Promise<Post> {
  const supabase = createAdminClient();

  // Defense in depth for #91 (D4). The AI-service layer (ai.service.ts:895)
  // already dedupes Gemini's stockTickers output before they reach this
  // function on the AI-driven path; this dedup protects non-AI callers
  // (e.g. user-driven /api/import/batch, future webhook ingestion, manual
  // seed scripts) from triggering the post_stocks UNIQUE(post_id, stock_id)
  // constraint by passing duplicate stockIds. Silent — the AI layer is the
  // canonical observation point if/when we add logging.
  const uniqueStockIds = Array.from(new Set(input.stockIds ?? []));

  // Build stock array for RPC
  const stocksParam = uniqueStockIds.map((stockId) => ({
    stock_id: stockId,
    sentiment: input.stockSentiments?.[stockId] ?? null,
    source: input.stockSources?.[stockId]?.source ?? 'explicit',
    inference_reason: input.stockSources?.[stockId]?.inferenceReason ?? null,
  }));

  // Build arguments array for RPC (resolve ticker → stock_id)
  let argumentsParam: unknown[] = [];
  if (input.draftAiArguments?.length && uniqueStockIds.length) {
    // Look up ticker → stockId mapping
    const { data: stockRows } = await supabase
      .from('stocks')
      .select('id, ticker')
      .in('id', uniqueStockIds);

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
          statement_type: arg.statementType ?? 'mixed',
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
    p_content_fingerprint: input.contentFingerprint ?? null,
    p_source: input.source ?? null,
  });

  if (rpcError) throw new Error(rpcError.message);

  // RPC returns the post row as JSONB
  const row = rpcData as DbPost;
  // Fire-and-forget scorecard invalidation for the KOL + every referenced stock.
  void invalidateScorecardsAfterPostWrite(row.kol_id, uniqueStockIds);
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

  // Any sentiment-bearing field changed → invalidate cached samples.
  if (input.sentiment !== undefined || input.stockSentiments) {
    await invalidateSamplesAfterSentimentWrite(id);
  }

  const p = await getPostById(id);
  // Scorecard invalidation: sentiment changes shift classification; stock
  // edits shift which stock scorecards a post contributes to. Fire-and-forget.
  if (p && (input.sentiment !== undefined || input.stockSentiments)) {
    void invalidateScorecardsAfterPostWrite(
      p.kolId,
      p.stocks.map((s) => s.id)
    );
  }
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

  // AI re-analysis always rewrites post.sentiment; drop cached samples so the
  // next win-rate read re-classifies with the new values.
  await invalidateSamplesAfterSentimentWrite(id);

  // Scorecard invalidation: re-analysis changes classification outcomes.
  const stockIds = Object.keys(input.stockSentiments ?? {});
  void invalidateScorecardsAfterPostWrite((row as DbPost).kol_id, stockIds);

  return mapDbToPost(row as DbPost);
}

export async function deletePost(id: string, userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  // Look up KOL + stocks BEFORE deletion so the scorecard invalidation after
  // the RPC has something to invalidate.
  const existing = await getPostById(id);

  // Verify ownership before deleting
  const { data: post } = await supabase
    .from('posts')
    .select('id')
    .eq('id', id)
    .eq('created_by', userId)
    .maybeSingle();
  if (!post) return false;
  // Use the promotion RPC so that if this is a primary with mirrors,
  // the oldest mirror is promoted and inherits post_stocks/post_arguments.
  const { error } = await supabase.rpc('delete_post_and_promote_mirror', {
    p_post_id: id,
  });
  if (error) throw new Error(error.message);

  // Scorecard invalidation: deletion removes this post's contribution from
  // the KOL + every referenced stock's aggregate.
  if (existing) {
    void invalidateScorecardsAfterPostWrite(
      existing.kolId,
      existing.stocks.map((s) => s.id)
    );
  }
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
    .select('stock_id, sentiment, source, inference_reason')
    .eq('post_id', post.id);
  const psEntries = (psRows ?? []) as {
    stock_id: string;
    sentiment: number | null;
    source: string | null;
    inference_reason: string | null;
  }[];
  const stockIds = psEntries.map((p) => p.stock_id);
  let stocks: PostWithRelations['stocks'] = [];
  if (stockIds.length > 0) {
    const { data: sRows } = await supabase
      .from('stocks')
      .select('id, ticker, name')
      .in('id', stockIds);
    const psMap = new Map(psEntries.map((p) => [p.stock_id, p]));
    stocks = (sRows ?? []).map((s) => {
      const ps = psMap.get(s.id as string);
      return {
        id: s.id as string,
        ticker: s.ticker as string,
        name: s.name as string,
        sentiment: (ps?.sentiment as Post['sentiment'] | null) ?? null,
        source: (ps?.source === 'inferred'
          ? 'inferred'
          : 'explicit') as import('@/domain/models/post').TickerSource,
        inferenceReason: ps?.inference_reason ?? null,
      };
    });
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

// ── Content dedup: fingerprint lookup + mirror creation ──

export async function findPrimaryPostByFingerprint(
  kolId: string,
  fingerprint: string
): Promise<Post | null> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('posts')
    .select('*')
    .eq('kol_id', kolId)
    .eq('content_fingerprint', fingerprint)
    .is('primary_post_id', null)
    .maybeSingle();
  if (error || !row) return null;
  return mapDbToPost(row as DbPost);
}

export interface CreateMirrorPostInput {
  sourceUrl: string;
  sourcePlatform: SourcePlatform | string;
  title: string | null;
  postedAt: Date;
  kolId: string;
  primaryPostId: string;
  createdBy: string | null;
  contentFingerprint: string | null;
}

export async function createMirrorPost(input: CreateMirrorPostInput): Promise<Post> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('posts')
    .insert({
      kol_id: input.kolId,
      title: input.title,
      content: '', // mirrors don't carry analysis content
      source_url: input.sourceUrl,
      source_platform: input.sourcePlatform,
      images: [],
      sentiment: 0, // placeholder; mirrors aren't used for analysis
      sentiment_ai_generated: false,
      posted_at: input.postedAt.toISOString(),
      created_by: input.createdBy,
      primary_post_id: input.primaryPostId,
      content_fingerprint: input.contentFingerprint,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapDbToPost(row as DbPost);
}
