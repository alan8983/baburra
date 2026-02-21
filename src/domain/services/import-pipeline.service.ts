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
import { analyzeDraftContent, extractArguments } from '@/domain/services/ai.service';
import type { Sentiment, SourcePlatform } from '@/domain/models/post';
import type { DraftAiArguments } from '@/domain/models/draft';

// ── Types ──

export interface ImportBatchInput {
  kolName: string;
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
}

export interface ImportBatchResult {
  kolId: string;
  kolName: string;
  kolCreated: boolean;
  urlResults: ImportUrlResult[];
  totalImported: number;
  totalDuplicate: number;
  totalError: number;
  onboardingQuotaUsed: boolean;
}

// ── Main Pipeline ──

export async function executeBatchImport(
  input: ImportBatchInput,
  userId: string
): Promise<ImportBatchResult> {
  const timezone = await getUserTimezone(userId);

  // Step 1: Check onboarding exemption
  const onboardingAlreadyUsed = await checkOnboardingImportUsed(userId);
  const isOnboardingExempt = !onboardingAlreadyUsed;

  // Step 2: Find or create KOL
  let kolCreated = false;
  const existingKol = await findKolByName(input.kolName);
  let kolId: string;

  if (existingKol) {
    kolId = existingKol.id;
  } else {
    const newKol = await createKol({ name: input.kolName });
    kolId = newKol.id;
    kolCreated = true;
  }

  // Step 3: Process each URL
  const urlResults: ImportUrlResult[] = [];
  let quotaExhausted = false;

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
      const result = await processUrl(url, kolId, userId, timezone, isOnboardingExempt);
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

  // Step 4: Mark onboarding import used (if this was the first import)
  if (isOnboardingExempt && urlResults.some((r) => r.status === 'success')) {
    await markOnboardingImportUsed(userId);
  }

  const totalImported = urlResults.filter((r) => r.status === 'success').length;
  const totalDuplicate = urlResults.filter((r) => r.status === 'duplicate').length;
  const totalError = urlResults.filter((r) => r.status === 'error').length;

  return {
    kolId,
    kolName: input.kolName,
    kolCreated,
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
  kolId: string,
  userId: string,
  timezone: string,
  quotaExempt: boolean
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

  // 5. Find or create stocks for identified tickers
  const stockIds: string[] = [];
  const stockSentiments: Record<string, Sentiment> = {};
  const tickerToStockId: Record<string, string> = {};

  for (const ticker of analysis.stockTickers) {
    try {
      const existing = await getStockByTicker(ticker.ticker);
      if (existing) {
        stockIds.push(existing.id);
        tickerToStockId[ticker.ticker.toUpperCase()] = existing.id;
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

  // 6. Extract arguments per stock (parallel)
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

  // 7. Create post
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
  };
}
