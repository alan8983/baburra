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
  findPrimaryPostByFingerprint,
  createMirrorPost,
} from '@/infrastructure/repositories';
import { computeContentFingerprint } from '@/domain/services/content-fingerprint.service';
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
import { getAiModelVersion } from '@/infrastructure/api/gemini.client';
import { isLikelyInvestmentContent } from '@/domain/services/content-filter';
import { cleanTranscript } from '@/domain/services/transcript-cleanup';
import { extractActualDuration } from '@/infrastructure/api/deepgram.client';
import { transcribeAudio, type StageCallback } from '@/domain/services/transcription.service';
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
  status: 'success' | 'duplicate' | 'mirror_linked' | 'error';
  postId?: string;
  primaryPostId?: string;
  addedAs?: string;
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
  const totalDuplicate = urlResults.filter(
    (r) => r.status === 'duplicate' || r.status === 'mirror_linked'
  ).length;
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

// ── Pipeline Timing (Golden Flow) ──

export interface PipelineTimings {
  extractMs: number;
  /** Total transcription wall time (download + transcribe overlap). 0 if cached. */
  transcriptionMs: number;
  /** Audio download sub-step (within transcription). */
  downloadMs: number;
  /** Deepgram/Gemini transcribe sub-step (within transcription). */
  transcribeMs: number;
  cleanupMs: number;
  analysisMs: number;
  argumentsMs: number;
  postCreationMs: number;
  totalMs: number;
  /** Number of stocks identified — drives argument extraction fan-out. */
  stockCount: number;
  /** Number of arguments extracted. */
  argumentCount: number;
  /** Whether transcript was served from cache. */
  cached: boolean;
}

function logTimings(url: string, t: PipelineTimings) {
  const s = (ms: number) => (ms / 1000).toFixed(1);
  const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? url.slice(-20);

  // Compact single-line format for grep-ability and dashboards
  const transcriptPart = t.cached
    ? 'transcript=cached'
    : `download=${s(t.downloadMs)}s transcribe=${s(t.transcribeMs)}s`;

  console.log(
    `[pipeline] ${videoId} | ` +
      `extract=${s(t.extractMs)}s ${transcriptPart} ` +
      `cleanup=${s(t.cleanupMs)}s analysis=${s(t.analysisMs)}s ` +
      `args=${s(t.argumentsMs)}s(${t.stockCount}→${t.argumentCount}) ` +
      `post=${s(t.postCreationMs)}s | ` +
      `total=${s(t.totalMs)}s`
  );
}

// ── Per-URL Processing ──

export async function processUrl(
  url: string,
  userId: string,
  timezone: string,
  quotaExempt: boolean,
  kolCache: Map<string, KolCacheEntry>,
  knownKolId?: string,
  onStage?: StageCallback
): Promise<ImportUrlResult> {
  const emit: StageCallback = (stage, meta) => {
    if (!onStage) return;
    try {
      onStage(stage, meta);
    } catch (err) {
      console.warn('[processUrl] stage callback threw:', err);
    }
  };

  const _t0 = Date.now();
  const timings: PipelineTimings = {
    extractMs: 0,
    transcriptionMs: 0,
    downloadMs: 0,
    transcribeMs: 0,
    cleanupMs: 0,
    analysisMs: 0,
    argumentsMs: 0,
    postCreationMs: 0,
    totalMs: 0,
    stockCount: 0,
    argumentCount: 0,
    cached: false,
  };

  // 1. Duplicate check — emit discovering so a progress UI can leave the
  // `queued` state immediately even for fast URL paths.
  emit('discovering');
  const existing = await findPostBySourceUrl(url);
  if (existing) {
    emit('done');
    return { url, status: 'duplicate', postId: existing.id };
  }

  // 2. Extract content from URL first (needed to determine credit cost)
  const _tExtract = Date.now();
  const fetchResult = await extractorFactory.extractFromUrl(url);
  timings.extractMs = Date.now() - _tExtract;
  if (fetchResult.title) {
    emit('discovering', { title: fetchResult.title });
  }

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
        const errorMessage = `Video too long (${Math.ceil(durationSeconds / 60)} min). Maximum is ${Math.ceil(MAX_VIDEO_DURATION_SECONDS / 60)} minutes.`;
        emit('failed', { errorMessage });
        return { url, status: 'error', error: errorMessage };
      }

      // Shorts pre-filter: check title/description for investment relevance before transcription
      if (isShort) {
        const title = fetchResult.title ?? '';
        const description = ''; // description not available on UrlFetchResult
        if (!isLikelyInvestmentContent(title, description)) {
          emit('failed', { errorMessage: 'filtered_not_investment' });
          return { url, status: 'error', error: 'filtered_not_investment' };
        }
      }

      // Check transcript cache first
      const cachedTranscript = await findTranscriptByUrl(fetchResult.sourceUrl);
      if (cachedTranscript) {
        contentForAnalysis = cachedTranscript.content;
        timings.cached = true;
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
              emit('failed', { errorMessage: 'Insufficient credits' });
              return { url, status: 'error', error: 'Insufficient credits' };
            }
            throw quotaErr;
          }
        }

        // Single transcription entry point — Deepgram primary, Gemini failover
        // (Shorts only). User is charged the same `transcribe.audio` block
        // regardless of which vendor ran. Forward the stage callback so the
        // transcription service can emit downloading / transcribing events.
        const _tTranscribe = Date.now();
        const transcription = await transcribeAudio({
          sourceUrl: fetchResult.sourceUrl,
          isShort,
          maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
          onStage: emit,
        });
        timings.transcriptionMs = Date.now() - _tTranscribe;
        if (transcription.timings) {
          timings.downloadMs = transcription.timings.downloadMs;
          timings.transcribeMs = transcription.timings.transcribeMs;
        }
        const transcriptText = transcription.text;
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

        // Save to transcript cache — use the actual vendor that ran for audit.
        await saveTranscript({
          sourceUrl: fetchResult.sourceUrl,
          content: transcriptText,
          source: transcription.source,
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
            emit('failed', { errorMessage: 'Insufficient credits' });
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
      emit('failed', { errorMessage: 'No content available' });
      return { url, status: 'error', error: 'No content available' };
    }

    // 3.5. Content fingerprint gate (Gate C) — detect cross-platform duplicates
    //       post-transcription, pre-AI-analysis. Skips Gemini costs on mirrors.
    const fingerprint = computeContentFingerprint(contentForAnalysis);
    if (fingerprint) {
      // Resolve KOL early for fingerprint scoping. Use knownKolId (profile scraping)
      // or fetchResult.kolName (from metadata). If neither is available, skip the
      // fingerprint check — the normal pipeline will handle it.
      let earlyKolId: string | undefined = knownKolId;
      if (!earlyKolId && fetchResult.kolName) {
        const earlyKol = await findKolByName(fetchResult.kolName);
        if (earlyKol) earlyKolId = earlyKol.id;
      }

      if (earlyKolId) {
        const primaryPost = await findPrimaryPostByFingerprint(earlyKolId, fingerprint);
        if (primaryPost) {
          // Create a mirror row — no AI analysis, no argument extraction
          const mirror = await createMirrorPost({
            sourceUrl: fetchResult.sourceUrl,
            sourcePlatform: fetchResult.sourcePlatform,
            title: fetchResult.title || null,
            postedAt: fetchResult.postedAt ? new Date(fetchResult.postedAt) : new Date(),
            kolId: earlyKolId,
            primaryPostId: primaryPost.id,
            createdBy: userId,
            contentFingerprint: fingerprint,
          });
          emit('done');
          return {
            url,
            status: 'mirror_linked',
            postId: mirror.id,
            primaryPostId: primaryPost.id,
            addedAs: fetchResult.sourcePlatform,
            title: fetchResult.title || undefined,
            sourcePlatform: fetchResult.sourcePlatform,
            kolId: earlyKolId,
            kolName: fetchResult.kolName || undefined,
          };
        }
      }
    }

    // 3.5. Clean transcript for AI analysis (merge letter fragments, fix zh-CN→zh-TW, dictionary)
    const _tCleanup = Date.now();
    contentForAnalysis = cleanTranscript(contentForAnalysis);
    timings.cleanupMs = Date.now() - _tCleanup;

    // 4. AI analysis (sentiment + ticker identification in one call)
    emit('analyzing');
    const _tAnalysis = Date.now();
    const analysis = await analyzeDraftContent(contentForAnalysis, timezone);
    timings.analysisMs = Date.now() - _tAnalysis;

    // 5. Zero-ticker rejection — skip post creation if no stocks identified
    if (analysis.stockTickers.length === 0) {
      // Refund credits since no post will be created
      if (!quotaExempt && creditsConsumed > 0) {
        await refundCredits(userId, creditsConsumed).catch((err) =>
          console.error('Credit refund failed (zero tickers):', err)
        );
      }
      // Treat filtered-out content as done (from the item's perspective) but
      // carry the filter reason so the UI can distinguish it from a true error.
      emit('done', { errorMessage: 'no_tickers_identified' });
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
    const _tArgs = Date.now();
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
          } else if (result.status === 'rejected') {
            const errMsg =
              result.reason instanceof Error ? result.reason.message : String(result.reason);
            console.warn(
              `[pipeline] extractArguments failed for ${analysis.stockTickers[i].ticker}: ${errMsg.slice(0, 200)}`
            );
          }
        }
        if (argumentResults.length > 0) {
          draftAiArguments = argumentResults;
        }
      } catch (argError) {
        console.error('Argument extraction failed:', argError);
      }
    }

    timings.argumentsMs = Date.now() - _tArgs;

    // 9. Create post (atomic via RPC) — catch duplicate key from concurrent inserts
    const _tPost = Date.now();
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
          contentFingerprint: fingerprint ?? undefined,
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

    timings.postCreationMs = Date.now() - _tPost;
    timings.totalMs = Date.now() - _t0;
    timings.stockCount = analysis.stockTickers.length;
    timings.argumentCount = draftAiArguments
      ? draftAiArguments.reduce((sum, g) => sum + g.arguments.length, 0)
      : 0;
    logTimings(url, timings);

    emit('done', {
      durationSeconds: fetchResult.durationSeconds ?? undefined,
      title: fetchResult.title ?? undefined,
    });
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
    emit('failed', {
      errorMessage: pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr),
    });
    throw pipelineErr;
  }
}
