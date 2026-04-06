/**
 * Import Pipeline Service — 批次匯入 KOL 文章
 *
 * Standalone domain service that orchestrates:
 * URL extraction → KOL creation → Post creation → AI analysis
 *
 * Designed to be reusable across multiple entry points:
 * - /api/import/batch API route
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
} from '@/infrastructure/repositories';
import {
  consumeCredits,
  refundCredits,
  reconcileTranscriptionCredits,
} from '@/infrastructure/repositories/ai-usage.repository';
import {
  findTranscriptByUrl,
  saveTranscript,
} from '@/infrastructure/repositories/transcript.repository';
import {
  checkFirstImportFree,
  markFirstImportUsed,
  getUserTimezone,
} from '@/infrastructure/repositories/profile.repository';
import {
  analyzeDraftContent,
  extractArguments,
  extractAtHandles,
} from '@/domain/services/ai.service';
import { getAiModelVersion, geminiTranscribeShort } from '@/infrastructure/api/gemini.client';
import { downloadYoutubeAudio } from '@/infrastructure/api/youtube-audio.client';
import { isLikelyInvestmentContent } from '@/domain/services/content-filter';
import { deepgramTranscribe, extractActualDuration } from '@/infrastructure/api/deepgram.client';
import { composeCost, type Recipe } from '@/domain/models/credit-blocks';

// Per-minute long-video transcription marginal recipe (download + transcribe).
// composeCost is computed per total to allow correct fractional rounding.
function longVideoTranscriptionCost(minutes: number): number {
  const recipe: Recipe = [
    { block: 'download.audio.long', units: minutes },
    { block: 'transcribe.audio', units: minutes },
  ];
  return composeCost(recipe);
}

// Flat-rate Short transcription recipe (download.audio.short + transcribe.audio×1
// + ai.analyze.short, plus the up-front youtube_meta scrape that's already paid
// in the discovery step but billed as part of the Short flow).
const SHORT_TRANSCRIPTION_RECIPE: Recipe = [
  { block: 'scrape.youtube_meta', units: 1 },
  { block: 'download.audio.short', units: 1 },
  { block: 'transcribe.audio', units: 1 },
  { block: 'ai.analyze.short', units: 1 },
];
const SHORT_TRANSCRIPTION_COST = composeCost(SHORT_TRANSCRIPTION_RECIPE);

// Per-minute marginal block cost (used by reconcileTranscriptionCredits).
const PER_MINUTE_TRANSCRIBE_COST = composeCost([
  { block: 'download.audio.long', units: 1 },
  { block: 'transcribe.audio', units: 1 },
]);

const YOUTUBE_CAPTION_ANALYSIS_RECIPE: Recipe = [
  { block: 'scrape.youtube_meta', units: 1 },
  { block: 'scrape.youtube_captions', units: 1 },
  { block: 'ai.analyze.short', units: 1 },
];
const YOUTUBE_CAPTION_ANALYSIS_COST = composeCost(YOUTUBE_CAPTION_ANALYSIS_RECIPE);

const TEXT_ANALYSIS_RECIPE: Recipe = [
  { block: 'scrape.html', units: 1 },
  { block: 'ai.analyze.short', units: 1 },
];
const TEXT_ANALYSIS_COST = composeCost(TEXT_ANALYSIS_RECIPE);
import type { Sentiment, SourcePlatform } from '@/domain/models/post';
import type { DraftAiArguments } from '@/domain/models/draft';

const MAX_VIDEO_DURATION_SECONDS = 120 * 60; // 120 minutes

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
  firstImportFreeUsed: boolean;
}

// ── KOL Cache ──

export type KolCacheEntry = { kolId: string; kolCreated: boolean };

// ── Main Pipeline ──

export async function executeBatchImport(
  input: ImportBatchInput,
  userId: string
): Promise<ImportBatchResult> {
  const timezone = await getUserTimezone(userId);

  // Step 1: Check first-import-free exemption
  const isFirstImportFree = await checkFirstImportFree(userId);

  // Step 2: Process all URLs in parallel for speed
  // Each processUrl handles its own quota consumption and error recovery
  const kolCache = new Map<string, KolCacheEntry>();

  const settled = await Promise.allSettled(
    input.urls.map((url) => processUrl(url, userId, timezone, isFirstImportFree, kolCache))
  );

  const urlResults: ImportUrlResult[] = settled.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      url: input.urls[i],
      status: 'error' as const,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : typeof result.reason === 'object' &&
              result.reason !== null &&
              'message' in result.reason
            ? String((result.reason as { message: unknown }).message)
            : 'Unknown error',
    };
  });

  // Step 3: Mark first import used (if this was the free first import)
  if (isFirstImportFree && urlResults.some((r) => r.status === 'success')) {
    await markFirstImportUsed(userId);
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
    firstImportFreeUsed: isFirstImportFree && totalImported > 0,
  };
}

// ── Per-URL Processing ──

export async function processUrl(
  url: string,
  userId: string,
  timezone: string,
  quotaExempt: boolean,
  kolCache: Map<string, KolCacheEntry>,
  knownKolId?: string
): Promise<ImportUrlResult> {
  // 1. Duplicate check
  const existing = await findPostBySourceUrl(url);
  if (existing) {
    return { url, status: 'duplicate', postId: existing.id };
  }

  // 2. Extract content from URL first (needed to determine credit cost)
  const fetchResult = await extractorFactory.extractFromUrl(url);

  // 3. Determine credit cost and handle YouTube transcription
  let contentForAnalysis: string;
  let creditsConsumed = 0;

  // Detect Shorts: <=60s YouTube videos
  const isShort =
    (fetchResult.sourcePlatform === 'youtube_short' || fetchResult.sourcePlatform === 'youtube') &&
    (fetchResult.durationSeconds ?? 0) > 0 &&
    fetchResult.durationSeconds! <= 60;

  // Override sourcePlatform for Shorts
  if (isShort && fetchResult.sourcePlatform !== 'youtube_short') {
    fetchResult.sourcePlatform = 'youtube_short';
  }

  // Steps 3-9 are wrapped in try/catch to refund credits on failure
  try {
    if (
      fetchResult.content === null &&
      (fetchResult.sourcePlatform === 'youtube' || fetchResult.sourcePlatform === 'youtube_short')
    ) {
      // YouTube video with no captions — need transcription
      const durationSeconds = fetchResult.durationSeconds;

      // Reject videos exceeding max duration
      if (durationSeconds && durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
        return {
          url,
          status: 'error',
          error: `Video too long (${Math.ceil(durationSeconds / 60)} min). Maximum is ${Math.ceil(MAX_VIDEO_DURATION_SECONDS / 60)} minutes.`,
        };
      }

      // Shorts pre-filter: check title/description for investment relevance before transcription
      if (isShort) {
        const title = fetchResult.title ?? '';
        const description = ''; // description not available on UrlFetchResult
        if (!isLikelyInvestmentContent(title, description)) {
          return { url, status: 'error', error: 'filtered_not_investment' };
        }
      }

      // Check transcript cache first
      const cachedTranscript = await findTranscriptByUrl(fetchResult.sourceUrl);
      if (cachedTranscript) {
        contentForAnalysis = cachedTranscript.content;
      } else {
        // Determine credit cost: flat-rate Short recipe, or per-minute long-video recipe.
        const transcriptionCost = isShort
          ? SHORT_TRANSCRIPTION_COST
          : longVideoTranscriptionCost(Math.ceil((durationSeconds || 60) / 60));

        // Consume credits for transcription (unless exempt)
        if (!quotaExempt) {
          try {
            await consumeCredits(userId, transcriptionCost, 'video_transcription');
            creditsConsumed += transcriptionCost;
          } catch (quotaErr) {
            if (
              quotaErr &&
              typeof quotaErr === 'object' &&
              'code' in quotaErr &&
              (quotaErr as { code: string }).code === 'INSUFFICIENT_CREDITS'
            ) {
              return { url, status: 'error', error: 'Insufficient credits' };
            }
            throw quotaErr;
          }
        }

        let transcriptText: string;

        if (isShort) {
          // Shorts: try Gemini file_uri first, fall back to Deepgram
          try {
            console.log(
              `[Pipeline] Captionless Short (${durationSeconds}s) — trying Gemini file_uri transcription`
            );
            transcriptText = await geminiTranscribeShort(fetchResult.sourceUrl);
          } catch (geminiErr) {
            console.warn(
              `[Pipeline] Gemini file_uri failed for Short, falling back to Deepgram:`,
              geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
            );
            try {
              const audio = await downloadYoutubeAudio(fetchResult.sourceUrl, {
                maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
              });
              transcriptText = await deepgramTranscribe(audio.buffer, audio.mimeType);
            } catch (deepgramErr) {
              console.error(
                `[Transcription failed] URL: ${fetchResult.sourceUrl} | pipeline=deepgram-fallback | Error: ${deepgramErr instanceof Error ? deepgramErr.message : String(deepgramErr)}`
              );
              throw deepgramErr;
            }
          }
        } else {
          // Long videos: Deepgram only
          try {
            console.log(
              `[Pipeline] Captionless video (${durationSeconds ? Math.ceil(durationSeconds / 60) + 'min' : 'unknown duration'}) — using Deepgram transcription`
            );

            const audio = await downloadYoutubeAudio(fetchResult.sourceUrl, {
              maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
            });

            transcriptText = await deepgramTranscribe(audio.buffer, audio.mimeType);
          } catch (transcribeErr) {
            console.error(
              `[Transcription failed] URL: ${fetchResult.sourceUrl} | pipeline=deepgram | Error: ${transcribeErr instanceof Error ? transcribeErr.message : String(transcribeErr)}`
            );
            throw transcribeErr;
          }
        }
        contentForAnalysis = transcriptText;

        // Post-transcription credit reconciliation (skip for flat-rate Shorts)
        if (!isShort && !quotaExempt && creditsConsumed > 0) {
          try {
            const actualDurationSec = extractActualDuration(transcriptText);
            if (actualDurationSec !== null) {
              const estimatedMinutes = Math.ceil((durationSeconds || 60) / 60);
              const actualMinutes = actualDurationSec / 60;
              await reconcileTranscriptionCredits(
                userId,
                estimatedMinutes,
                actualMinutes,
                PER_MINUTE_TRANSCRIBE_COST
              );
            }
          } catch (reconErr) {
            console.error('Credit reconciliation failed (non-blocking):', reconErr);
          }
        }

        // Save to transcript cache
        const transcriptSource = isShort ? 'gemini' : 'deepgram';
        await saveTranscript({
          sourceUrl: fetchResult.sourceUrl,
          content: transcriptText,
          source: transcriptSource,
          durationSeconds: durationSeconds ?? undefined,
        }).catch((err) => console.error('Failed to cache transcript:', err));
      }
    } else if (fetchResult.content !== null) {
      contentForAnalysis = fetchResult.content;

      // Determine credit cost based on platform
      const isYouTube =
        fetchResult.sourcePlatform === 'youtube' || fetchResult.sourcePlatform === 'youtube_short';
      const creditCost = isYouTube ? YOUTUBE_CAPTION_ANALYSIS_COST : TEXT_ANALYSIS_COST;

      // Consume credits (unless exempt)
      if (!quotaExempt) {
        try {
          await consumeCredits(
            userId,
            creditCost,
            isYouTube ? 'youtube_caption_analysis' : 'text_analysis'
          );
          creditsConsumed += creditCost;
        } catch (quotaErr) {
          if (
            quotaErr &&
            typeof quotaErr === 'object' &&
            'code' in quotaErr &&
            (quotaErr as { code: string }).code === 'INSUFFICIENT_CREDITS'
          ) {
            return { url, status: 'error', error: 'Insufficient credits' };
          }
          throw quotaErr;
        }
      }

      // Save YouTube captions to transcript cache for future use
      if (isYouTube && fetchResult.captionSource === 'caption') {
        await saveTranscript({
          sourceUrl: fetchResult.sourceUrl,
          content: fetchResult.content,
          source: 'caption',
          durationSeconds: fetchResult.durationSeconds ?? undefined,
        }).catch((err) => console.error('Failed to cache caption transcript:', err));
      }
    } else {
      // Non-YouTube content with null content (shouldn't happen, but handle gracefully)
      return { url, status: 'error', error: 'No content available' };
    }

    // 4. AI analysis (sentiment + ticker identification in one call)
    const analysis = await analyzeDraftContent(contentForAnalysis, timezone);

    // 5. Zero-ticker rejection — skip post creation if no stocks identified
    if (analysis.stockTickers.length === 0) {
      // Refund credits since no post will be created
      if (!quotaExempt && creditsConsumed > 0) {
        await refundCredits(userId, creditsConsumed).catch((err) =>
          console.error('Credit refund failed (zero tickers):', err)
        );
      }
      return { url, status: 'error', error: 'no_tickers_identified' };
    }

    // 6. Resolve KOL: use knownKolId if provided, otherwise auto-detect
    let kolCreated = false;
    let kolId: string;
    let detectedKolName: string;

    if (knownKolId) {
      kolId = knownKolId;
      detectedKolName = fetchResult.kolName || 'Unknown';
      kolCreated = false;
    } else {
      detectedKolName =
        fetchResult.kolName ||
        analysis.kolName ||
        extractAtHandles(contentForAnalysis)[0] ||
        'Unknown';

      const normalizedName = detectedKolName.trim().toLowerCase();
      let kolEntry = kolCache.get(normalizedName);

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
      kolId = kolEntry.kolId;
    }

    // 7. Find or create stocks for identified tickers
    const stockIds: string[] = [];
    const stockSentiments: Record<string, Sentiment> = {};
    const stockSources: Record<
      string,
      { source: 'explicit' | 'inferred'; inferenceReason?: string }
    > = {};
    const tickerToStockId: Record<string, string> = {};

    for (const ticker of analysis.stockTickers) {
      try {
        const existingStock = await getStockByTicker(ticker.ticker);
        let stockId: string;
        if (existingStock) {
          stockId = existingStock.id;
          stockIds.push(stockId);
        } else {
          const newStock = await createStock({
            ticker: ticker.ticker,
            name: ticker.name,
            market: ticker.market,
          });
          stockId = newStock.id;
          stockIds.push(stockId);
        }
        tickerToStockId[ticker.ticker.toUpperCase()] = stockId;
        stockSources[stockId] = {
          source: ticker.source ?? 'explicit',
          ...(ticker.inferenceReason ? { inferenceReason: ticker.inferenceReason } : {}),
        };
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
            extractArguments(contentForAnalysis, ticker.ticker, ticker.name)
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

    // 9. Create post (atomic via RPC) — catch duplicate key from concurrent inserts
    let post;
    try {
      post = await createPost(
        {
          kolId,
          stockIds,
          content: contentForAnalysis,
          sourceUrl: fetchResult.sourceUrl,
          sourcePlatform: fetchResult.sourcePlatform as SourcePlatform,
          title: fetchResult.title || undefined,
          images: fetchResult.images,
          sentiment: analysis.sentiment,
          sentimentAiGenerated: true,
          aiModelVersion: getAiModelVersion(),
          stockSentiments: Object.keys(stockSentiments).length > 0 ? stockSentiments : undefined,
          stockSources: Object.keys(stockSources).length > 0 ? stockSources : undefined,
          postedAt: fetchResult.postedAt
            ? new Date(fetchResult.postedAt)
            : analysis.postedAt
              ? new Date(analysis.postedAt)
              : new Date(),
          draftAiArguments,
        },
        userId
      );
    } catch (createErr) {
      // Handle duplicate key violation from concurrent batch processing
      const errMsg = createErr instanceof Error ? createErr.message : String(createErr);
      if (errMsg.includes('duplicate key') || errMsg.includes('unique constraint')) {
        const existingPost = await findPostBySourceUrl(url);
        if (existingPost) {
          return { url, status: 'duplicate', postId: existingPost.id };
        }
      }
      throw createErr;
    }

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
  } catch (pipelineErr) {
    // Refund credits if consumed but pipeline failed
    if (!quotaExempt && creditsConsumed > 0) {
      await refundCredits(userId, creditsConsumed).catch((refundErr) =>
        console.error('Credit refund failed:', refundErr)
      );
    }
    throw pipelineErr;
  }
}
