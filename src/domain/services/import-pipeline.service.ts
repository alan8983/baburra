/**
 * Import Pipeline Service — 批次匯入 KOL 文章
 *
 * Standalone domain service that orchestrates:
 * URL extraction → KOL creation → Post creation → AI analysis
 *
 * Designed to be reusable across multiple entry points:
 * - /api/import/batch API route
 * - Onboarding flow (Phase 13)
 * - Profile auto-discovery (Phase 12b)
 */

import { extractorFactory } from '@/infrastructure/extractors';
import {
  findKolByName,
  createKol,
  findPostBySourceUrl,
  createPost,
  getStockByTicker,
  createStock,
  consumeAiQuota,
} from '@/infrastructure/repositories';
import {
  checkOnboardingImportUsed,
  markOnboardingImportUsed,
  getUserTimezone,
} from '@/infrastructure/repositories/profile.repository';
import {
  analyzeDraftContent,
  extractArguments,
  extractAtHandles,
} from '@/domain/services/ai.service';
import type { Sentiment, SourcePlatform } from '@/domain/models/post';
import type { DraftAiArguments } from '@/domain/models/draft';

// ── Types ──

export interface ImportBatchInput {
  urls: string[]; // 1-5 URLs
}

export interface ImportUrlResult {
  url: string;
  status: 'success' | 'duplicate' | 'error';
  postId?: string;
  title?: string;
  sourcePlatform?: string;
  error?: string;
  stockTickers?: string[];
  sentiment?: Sentiment;
  kolId?: string;
  kolName?: string;
  kolCreated?: boolean;
}

export interface ImportKolSummary {
  kolId: string;
  kolName: string;
  kolCreated: boolean;
  postCount: number;
}

export interface ImportBatchResult {
  kols: ImportKolSummary[];
  urlResults: ImportUrlResult[];
  totalImported: number;
  totalDuplicate: number;
  totalError: number;
  onboardingQuotaUsed: boolean;
}

// ── KOL Cache ──

type KolCacheEntry = { kolId: string; kolCreated: boolean };

// ── Main Pipeline ──

export async function executeBatchImport(
  input: ImportBatchInput,
  userId: string
): Promise<ImportBatchResult> {
  const timezone = await getUserTimezone(userId);

  // Step 1: Check onboarding exemption
  const onboardingAlreadyUsed = await checkOnboardingImportUsed(userId);
  const isOnboardingExempt = !onboardingAlreadyUsed;

  // Step 2: Process each URL (KOL resolved per-URL via auto-detection)
  const urlResults: ImportUrlResult[] = [];
  let quotaExhausted = false;
  const kolCache = new Map<string, KolCacheEntry>();

  for (let i = 0; i < input.urls.length; i++) {
    const url = input.urls[i];

    // If quota was exhausted in a previous URL, skip remaining
    if (quotaExhausted) {
      urlResults.push({
        url,
        status: 'error',
        error: 'AI quota exceeded — skipped',
      });
      continue;
    }

    try {
      const result = await processUrl(url, userId, timezone, isOnboardingExempt, kolCache);
      urlResults.push(result);

      // Check if quota exhaustion occurred
      if (result.status === 'error' && result.error?.includes('quota')) {
        quotaExhausted = true;
      }
    } catch (error) {
      urlResults.push({
        url,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Step 3: Mark onboarding import used (if this was the first import)
  if (isOnboardingExempt && urlResults.some((r) => r.status === 'success')) {
    await markOnboardingImportUsed(userId);
  }

  // Step 4: Aggregate KOL summary from successful results
  const kolMap = new Map<string, ImportKolSummary>();
  for (const r of urlResults) {
    if (r.status === 'success' && r.kolId && r.kolName) {
      const existing = kolMap.get(r.kolId);
      if (existing) {
        existing.postCount++;
      } else {
        kolMap.set(r.kolId, {
          kolId: r.kolId,
          kolName: r.kolName,
          kolCreated: r.kolCreated ?? false,
          postCount: 1,
        });
      }
    }
  }

  const totalImported = urlResults.filter((r) => r.status === 'success').length;
  const totalDuplicate = urlResults.filter((r) => r.status === 'duplicate').length;
  const totalError = urlResults.filter((r) => r.status === 'error').length;

  return {
    kols: Array.from(kolMap.values()),
    urlResults,
    totalImported,
    totalDuplicate,
    totalError,
    onboardingQuotaUsed: isOnboardingExempt && totalImported > 0,
  };
}

// ── Per-URL Processing ──

async function processUrl(
  url: string,
  userId: string,
  timezone: string,
  quotaExempt: boolean,
  kolCache: Map<string, KolCacheEntry>
): Promise<ImportUrlResult> {
  // 1. Duplicate check
  const existing = await findPostBySourceUrl(url);
  if (existing) {
    return { url, status: 'duplicate', postId: existing.id };
  }

  // 2. Consume AI quota (unless exempt)
  if (!quotaExempt) {
    try {
      await consumeAiQuota(userId);
    } catch (quotaErr) {
      if (
        quotaErr &&
        typeof quotaErr === 'object' &&
        'code' in quotaErr &&
        (quotaErr as { code: string }).code === 'AI_QUOTA_EXCEEDED'
      ) {
        return { url, status: 'error', error: 'AI quota exceeded' };
      }
      throw quotaErr;
    }
  }

  // 3. Extract content from URL
  const fetchResult = await extractorFactory.extractFromUrl(url);

  // 4. AI analysis (sentiment + ticker identification in one call)
  const analysis = await analyzeDraftContent(fetchResult.content, timezone);

  // 5. Zero-ticker rejection — skip post creation if no stocks identified
  if (analysis.stockTickers.length === 0) {
    return { url, status: 'error', error: 'no_tickers_identified' };
  }

  // 6. Auto-detect KOL: extractor > AI > @handle > "Unknown"
  const detectedKolName =
    fetchResult.kolName ||
    analysis.kolName ||
    extractAtHandles(fetchResult.content)[0] ||
    'Unknown';

  const normalizedName = detectedKolName.trim().toLowerCase();
  let kolEntry = kolCache.get(normalizedName);
  let kolCreated = false;

  if (!kolEntry) {
    const existingKol = await findKolByName(detectedKolName);
    if (existingKol) {
      kolEntry = { kolId: existingKol.id, kolCreated: false };
    } else {
      const newKol = await createKol({ name: detectedKolName });
      kolEntry = { kolId: newKol.id, kolCreated: true };
    }
    kolCache.set(normalizedName, kolEntry);
  }

  kolCreated = kolEntry.kolCreated;
  const kolId = kolEntry.kolId;

  // 7. Find or create stocks for identified tickers
  const stockIds: string[] = [];
  const stockSentiments: Record<string, Sentiment> = {};
  const tickerToStockId: Record<string, string> = {};

  for (const ticker of analysis.stockTickers) {
    try {
      const existingStock = await getStockByTicker(ticker.ticker);
      if (existingStock) {
        stockIds.push(existingStock.id);
        tickerToStockId[ticker.ticker.toUpperCase()] = existingStock.id;
      } else {
        const newStock = await createStock({
          ticker: ticker.ticker,
          name: ticker.name,
          market: ticker.market,
        });
        stockIds.push(newStock.id);
        tickerToStockId[ticker.ticker.toUpperCase()] = newStock.id;
      }
    } catch (stockErr) {
      console.error(`Failed to find/create stock ${ticker.ticker}:`, stockErr);
    }
  }

  // Map per-ticker sentiments to per-stockId sentiments
  if (analysis.stockSentiments) {
    for (const [ticker, sentiment] of Object.entries(analysis.stockSentiments)) {
      const stockId = tickerToStockId[ticker.toUpperCase()];
      if (stockId) {
        stockSentiments[stockId] = sentiment;
      }
    }
  }

  // 8. Extract arguments per stock (parallel)
  let draftAiArguments: DraftAiArguments[] | undefined;
  if (analysis.stockTickers.length > 0) {
    try {
      const results = await Promise.allSettled(
        analysis.stockTickers.map((ticker) =>
          extractArguments(fetchResult.content, ticker.ticker, ticker.name)
        )
      );
      const argumentResults: DraftAiArguments[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value.arguments.length > 0) {
          argumentResults.push({
            ticker: analysis.stockTickers[i].ticker,
            name: analysis.stockTickers[i].name,
            arguments: result.value.arguments,
          });
        }
      }
      if (argumentResults.length > 0) {
        draftAiArguments = argumentResults;
      }
    } catch (argError) {
      console.error('Argument extraction failed:', argError);
    }
  }

  // 9. Create post
  const post = await createPost(
    {
      kolId,
      stockIds,
      content: fetchResult.content,
      sourceUrl: fetchResult.sourceUrl,
      sourcePlatform: fetchResult.sourcePlatform as SourcePlatform,
      title: fetchResult.title || undefined,
      images: fetchResult.images,
      sentiment: analysis.sentiment,
      sentimentAiGenerated: true,
      stockSentiments: Object.keys(stockSentiments).length > 0 ? stockSentiments : undefined,
      postedAt: analysis.postedAt
        ? new Date(analysis.postedAt)
        : fetchResult.postedAt
          ? new Date(fetchResult.postedAt)
          : new Date(),
      draftAiArguments,
    },
    userId
  );

  return {
    url,
    status: 'success',
    postId: post.id,
    title: fetchResult.title || undefined,
    sourcePlatform: fetchResult.sourcePlatform,
    stockTickers: analysis.stockTickers.map((t) => t.ticker),
    sentiment: analysis.sentiment,
    kolId,
    kolName: detectedKolName,
    kolCreated,
  };
}
