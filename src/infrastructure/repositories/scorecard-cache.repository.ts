/**
 * ScorecardCache Repository
 *
 * Read/write access to `kol_scorecard_cache` and `stock_scorecard_cache` —
 * the Layer 3 aggregate cache on top of `post_win_rate_samples`.
 *
 * The scorecard service is the only legitimate writer. Reads come from the
 * API routes via the miss-aware helpers below; misses are reported so the
 * caller can return `{ status: 'computing' }` and enqueue a recompute.
 *
 * TTL staleness — see openspec/changes/persist-kol-scorecard-cache/design.md D6.
 * Vercel Hobby offers no scheduled cron, so instead of a nightly job we treat
 * any row older than 12h as a miss. The first user to cross the boundary
 * triggers the background recompute via the normal read-through path.
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { WinRateBucket } from '@/domain/calculators';

/** Any cache row older than this is considered stale even without a flag. */
export const SCORECARD_TTL_MS = 12 * 60 * 60 * 1000;

/** Per-period bucket persisted in the JSONB columns. */
export type ScorecardBucket = WinRateBucket;

export interface KolScorecardBlob {
  day5: ScorecardBucket;
  day30: ScorecardBucket;
  day90: ScorecardBucket;
  day365: ScorecardBucket;
  /** stockId → per-period buckets (same shape as top-level). */
  bucketsByStock: Record<
    string,
    {
      day5: ScorecardBucket;
      day30: ScorecardBucket;
      day90: ScorecardBucket;
      day365: ScorecardBucket;
    }
  >;
  postCount: number;
  lastPostAt: string | null;
}

export interface StockScorecardBlob {
  day5: ScorecardBucket;
  day30: ScorecardBucket;
  day90: ScorecardBucket;
  day365: ScorecardBucket;
  /** kolId → per-period buckets. */
  bucketsByKol: Record<
    string,
    {
      day5: ScorecardBucket;
      day30: ScorecardBucket;
      day90: ScorecardBucket;
      day365: ScorecardBucket;
    }
  >;
  postCount: number;
  lastPostAt: string | null;
}

export interface CachedKolScorecard extends KolScorecardBlob {
  computedAt: string;
  classifierVersion: number;
}

export interface CachedStockScorecard extends StockScorecardBlob {
  computedAt: string;
  classifierVersion: number;
}

// ─── KOL scorecard ───────────────────────────────────────────────────────────

type KolRow = {
  kol_id: string;
  classifier_version: number;
  day5: ScorecardBucket;
  day30: ScorecardBucket;
  day90: ScorecardBucket;
  day365: ScorecardBucket;
  buckets_by_stock: KolScorecardBlob['bucketsByStock'];
  post_count: number;
  last_post_at: string | null;
  computed_at: string;
  stale: boolean;
};

function isFresh(computedAt: string): boolean {
  const t = Date.parse(computedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < SCORECARD_TTL_MS;
}

/**
 * Read a KOL's scorecard blob. Returns `null` when the row is missing,
 * stale-flagged, ttl-stale, or tagged with a non-matching classifier version.
 * The caller is responsible for enqueuing a recompute on null.
 */
export async function getKolScorecard(
  kolId: string,
  classifierVersion: number
): Promise<CachedKolScorecard | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('kol_scorecard_cache')
    .select(
      'kol_id, classifier_version, day5, day30, day90, day365, buckets_by_stock, post_count, last_post_at, computed_at, stale'
    )
    .eq('kol_id', kolId)
    .maybeSingle();

  if (error) {
    console.warn(`[scorecard-cache] getKolScorecard(${kolId}) failed:`, error.message);
    return null;
  }
  if (!data) return null;
  const row = data as KolRow;
  if (row.classifier_version !== classifierVersion) return null;
  if (row.stale) return null;
  if (!isFresh(row.computed_at)) return null;
  return {
    day5: row.day5,
    day30: row.day30,
    day90: row.day90,
    day365: row.day365,
    bucketsByStock: row.buckets_by_stock,
    postCount: row.post_count,
    lastPostAt: row.last_post_at,
    computedAt: row.computed_at,
    classifierVersion: row.classifier_version,
  };
}

export async function upsertKolScorecard(
  kolId: string,
  classifierVersion: number,
  blob: KolScorecardBlob
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('kol_scorecard_cache').upsert(
    {
      kol_id: kolId,
      classifier_version: classifierVersion,
      day5: blob.day5,
      day30: blob.day30,
      day90: blob.day90,
      day365: blob.day365,
      buckets_by_stock: blob.bucketsByStock,
      post_count: blob.postCount,
      last_post_at: blob.lastPostAt,
      computed_at: new Date().toISOString(),
      stale: false,
    },
    { onConflict: 'kol_id' }
  );
  if (error) {
    console.warn(`[scorecard-cache] upsertKolScorecard(${kolId}) failed:`, error.message);
  }
}

export async function markKolScorecardStale(kolIds: string[]): Promise<void> {
  if (kolIds.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('kol_scorecard_cache')
    .update({ stale: true })
    .in('kol_id', kolIds);
  if (error) {
    console.warn(
      `[scorecard-cache] markKolScorecardStale(n=${kolIds.length}) failed:`,
      error.message
    );
  }
}

// ─── Stock scorecard ─────────────────────────────────────────────────────────

type StockRow = {
  stock_id: string;
  classifier_version: number;
  day5: ScorecardBucket;
  day30: ScorecardBucket;
  day90: ScorecardBucket;
  day365: ScorecardBucket;
  buckets_by_kol: StockScorecardBlob['bucketsByKol'];
  post_count: number;
  last_post_at: string | null;
  computed_at: string;
  stale: boolean;
};

export async function getStockScorecard(
  stockId: string,
  classifierVersion: number
): Promise<CachedStockScorecard | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('stock_scorecard_cache')
    .select(
      'stock_id, classifier_version, day5, day30, day90, day365, buckets_by_kol, post_count, last_post_at, computed_at, stale'
    )
    .eq('stock_id', stockId)
    .maybeSingle();

  if (error) {
    console.warn(`[scorecard-cache] getStockScorecard(${stockId}) failed:`, error.message);
    return null;
  }
  if (!data) return null;
  const row = data as StockRow;
  if (row.classifier_version !== classifierVersion) return null;
  if (row.stale) return null;
  if (!isFresh(row.computed_at)) return null;
  return {
    day5: row.day5,
    day30: row.day30,
    day90: row.day90,
    day365: row.day365,
    bucketsByKol: row.buckets_by_kol,
    postCount: row.post_count,
    lastPostAt: row.last_post_at,
    computedAt: row.computed_at,
    classifierVersion: row.classifier_version,
  };
}

export async function upsertStockScorecard(
  stockId: string,
  classifierVersion: number,
  blob: StockScorecardBlob
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('stock_scorecard_cache').upsert(
    {
      stock_id: stockId,
      classifier_version: classifierVersion,
      day5: blob.day5,
      day30: blob.day30,
      day90: blob.day90,
      day365: blob.day365,
      buckets_by_kol: blob.bucketsByKol,
      post_count: blob.postCount,
      last_post_at: blob.lastPostAt,
      computed_at: new Date().toISOString(),
      stale: false,
    },
    { onConflict: 'stock_id' }
  );
  if (error) {
    console.warn(`[scorecard-cache] upsertStockScorecard(${stockId}) failed:`, error.message);
  }
}

export async function markStockScorecardStale(stockIds: string[]): Promise<void> {
  if (stockIds.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('stock_scorecard_cache')
    .update({ stale: true })
    .in('stock_id', stockIds);
  if (error) {
    console.warn(
      `[scorecard-cache] markStockScorecardStale(n=${stockIds.length}) failed:`,
      error.message
    );
  }
}

// ─── Composite invalidation ─────────────────────────────────────────────────

/**
 * Invalidate all scorecards affected by a post event. Called after
 * createPostAtomic, reanalyzePost, and post deletion.
 */
export async function invalidateScorecardsForPost(event: {
  kolId: string;
  stockIds: string[];
}): Promise<void> {
  await Promise.all([
    markKolScorecardStale([event.kolId]),
    markStockScorecardStale(event.stockIds),
  ]);
}
