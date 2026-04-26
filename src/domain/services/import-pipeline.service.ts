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
import { resolveStocksBatch } from '@/domain/services/ticker-resolver.service';
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
import type { StageTiming } from '@/domain/models/pipeline-timing';

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
  /**
   * Per-stage timing breakdown for this URL. Populated by processUrl when
   * the URL traverses at least one instrumented stage. Consumed by seed
   * scripts to emit JSONL lines for post-run aggregation.
   */
  timings?: StageTiming[];
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

interface StageMetaCounters {
  deepgramRetries: number;
  analysisRetries: number;
  argumentsRetries: number;
  deepgramOk: boolean;
  analysisOk: boolean;
  argumentsOk: boolean;
  extractOk: boolean;
  supabaseOk: boolean;
}

/**
 * Build a `StageTiming[]` snapshot from the internal `PipelineTimings` and
 * per-stage meta counters, skipping stages that did not run (ms === 0 and
 * not flagged as ok). Tiingo is not currently measured at this layer and is
 * omitted; it will be added when price hydration moves into processUrl.
 */
function buildStageTimings(t: PipelineTimings, m: StageMetaCounters): StageTiming[] {
  const out: StageTiming[] = [];
  if (t.extractMs > 0 || m.extractOk) {
    out.push({ stage: 'rss_lookup', ms: t.extractMs, ok: m.extractOk, retries: 0 });
  }
  if (t.downloadMs > 0) {
    out.push({ stage: 'audio_download', ms: t.downloadMs, ok: true, retries: 0 });
  }
  if (t.transcribeMs > 0 || m.deepgramOk) {
    out.push({
      stage: 'deepgram',
      ms: t.transcribeMs,
      ok: m.deepgramOk,
      retries: m.deepgramRetries,
    });
  }
  if (t.analysisMs > 0 || m.analysisOk) {
    out.push({
      stage: 'gemini_sentiment',
      ms: t.analysisMs,
      ok: m.analysisOk,
      retries: m.analysisRetries,
    });
  }
  if (t.argumentsMs > 0 || m.argumentsOk) {
    out.push({
      stage: 'gemini_args',
      ms: t.argumentsMs,
      ok: m.argumentsOk,
      retries: m.argumentsRetries,
    });
  }
  if (t.postCreationMs > 0 || m.supabaseOk) {
    out.push({
      stage: 'supabase_write',
      ms: t.postCreationMs,
      ok: m.supabaseOk,
      retries: 0,
    });
  }
  return out;
}

// ── Per-URL Processing ──

export async function processUrl(
  url: string,
  userId: string,
  timezone: string,
  quotaExempt: boolean,
  kolCache: Map<string, KolCacheEntry>,
  knownKolId?: string,
  onStage?: StageCallback,
  source?: 'seed' | 'user' | null
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

  // Per-stage retry counters — populated via meta out-params on client calls.
  const stageMeta = {
    deepgramRetries: 0,
    analysisRetries: 0,
    argumentsRetries: 0,
    analysisOk: false,
    argumentsOk: false,
    deepgramOk: false,
    extractOk: false,
    supabaseOk: false,
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
  stageMeta.extractOk = true;
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
        const deepgramMeta = { retries: 0 };
        const transcription = await transcribeAudio({
          sourceUrl: fetchResult.sourceUrl,
          isShort,
          maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
          onStage: emit,
          deepgramMeta,
        });
        timings.transcriptionMs = Date.now() - _tTranscribe;
        if (transcription.timings) {
          timings.downloadMs = transcription.timings.downloadMs;
          timings.transcribeMs = transcription.timings.transcribeMs;
        }
        stageMeta.deepgramRetries = deepgramMeta.retries;
        stageMeta.deepgramOk = true;
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
    //       Pass kolId so per-KOL vocabulary from the DB is included.
    const _tCleanup = Date.now();
    contentForAnalysis = await cleanTranscript(
      contentForAnalysis,
      knownKolId ? { kolId: knownKolId } : undefined
    );
    timings.cleanupMs = Date.now() - _tCleanup;

    // 4. AI analysis (sentiment + ticker identification in one call)
    emit('analyzing');
    const _tAnalysis = Date.now();
    const analysisMeta = { retries: 0, keyIndex: 0, finalModel: '' };
    const analysis = await analyzeDraftContent(contentForAnalysis, timezone, analysisMeta);
    timings.analysisMs = Date.now() - _tAnalysis;
    stageMeta.analysisRetries = analysisMeta.retries;
    stageMeta.analysisOk = true;

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
      return {
        url,
        status: 'error',
        error: 'no_tickers_identified',
        timings: buildStageTimings(timings, stageMeta),
      };
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

    // 7. Validate Gemini's tickers against the authoritative master, then find
    // or create stocks. The master lookup canonicalizes ticker form (e.g.
    // '2357' → '2357.TW') and overrides Gemini's company name (Gemini
    // hallucinates names — the master is the source of truth).
    //
    // Tickers absent from the master are silently dropped from the post.
    // resolveStocksBatch already logs each drop at info level.
    //
    // Spec: openspec/specs/ai-pipeline/spec.md (registry-validated extraction).
    const stockIds: string[] = [];
    const stockSentiments: Record<string, Sentiment> = {};
    const stockSources: Record<
      string,
      { source: 'explicit' | 'inferred'; inferenceReason?: string }
    > = {};
    const tickerToStockId: Record<string, string> = {};

    // Bulk-resolve in one DB round-trip per market (vs N sequential). The
    // resolver only supports US/TW/CRYPTO — HK tickers (legacy AI-output enum
    // value, never seeded into the master) get dropped here.
    const resolvedMap = await resolveStocksBatch(
      analysis.stockTickers
        .filter((t): t is typeof t & { market: 'US' | 'TW' | 'CRYPTO' } => t.market !== 'HK')
        .map((t) => ({ ticker: t.ticker, market: t.market }))
    );

    // Carry a parallel array of "resolved + Gemini metadata" so downstream
    // stages (extractArguments, sentiment mapping) work off canonical names
    // and tickers, while preserving Gemini's source/inferenceReason.
    type ResolvedStockTicker = {
      ticker: string;
      name: string;
      market: 'US' | 'TW' | 'CRYPTO';
      source: 'explicit' | 'inferred';
      inferenceReason?: string;
      originalTicker: string; // Gemini's pre-normalization ticker (for sentiment lookup)
    };
    const resolvedStockTickers: ResolvedStockTicker[] = [];
    for (const t of analysis.stockTickers) {
      if (t.market === 'HK') continue; // unsupported; resolver was bypassed for HK
      const resolved = resolvedMap.get(t.ticker);
      if (!resolved) continue; // dropped — already logged by the resolver
      resolvedStockTickers.push({
        ticker: resolved.ticker,
        name: resolved.name,
        market: resolved.market,
        source: t.source ?? 'explicit',
        ...(t.inferenceReason ? { inferenceReason: t.inferenceReason } : {}),
        originalTicker: t.ticker,
      });
    }

    for (const ticker of resolvedStockTickers) {
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

    // Map per-ticker sentiments to per-stockId sentiments. Gemini keys its
    // stockSentiments by the ORIGINAL (pre-normalization) ticker, so we route
    // through the original→resolved lookup before hitting tickerToStockId.
    if (analysis.stockSentiments) {
      const originalToCanonical = new Map(
        resolvedStockTickers.map((t) => [t.originalTicker.toUpperCase(), t.ticker.toUpperCase()])
      );
      for (const [ticker, sentiment] of Object.entries(analysis.stockSentiments)) {
        const canonical = originalToCanonical.get(ticker.toUpperCase());
        if (!canonical) continue; // sentiment for a dropped ticker — discard
        const stockId = tickerToStockId[canonical];
        if (stockId) {
          stockSentiments[stockId] = sentiment;
        }
      }
    }

    // If every Gemini-emitted ticker was rejected by the master, the post has
    // no real stocks. Refund credits and short-circuit, mirroring the
    // zero-tickers path at L617-633 above.
    if (resolvedStockTickers.length === 0) {
      if (!quotaExempt && creditsConsumed > 0) {
        await refundCredits(userId, creditsConsumed).catch((err) =>
          console.error('Credit refund failed (zero resolved tickers):', err)
        );
      }
      emit('done', { errorMessage: 'no_resolvable_tickers' });
      return {
        url,
        status: 'error',
        error: 'no_resolvable_tickers',
        timings: buildStageTimings(timings, stageMeta),
      };
    }

    // 8. Extract arguments per stock (parallel) — operates on the canonical
    // ticker/name from the master, not Gemini's pre-validation output.
    const _tArgs = Date.now();
    let draftAiArguments: DraftAiArguments[] | undefined;
    if (resolvedStockTickers.length > 0) {
      try {
        // One meta object per ticker call — retries summed, keyIndex/finalModel
        // from the last completed call (most recent signal).
        const argMetas = resolvedStockTickers.map(() => ({
          retries: 0,
          keyIndex: 0,
          finalModel: '',
        }));
        const results = await Promise.allSettled(
          resolvedStockTickers.map((ticker, i) =>
            extractArguments(contentForAnalysis, ticker.ticker, ticker.name, argMetas[i])
          )
        );
        const argumentResults: DraftAiArguments[] = [];
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled' && result.value.arguments.length > 0) {
            argumentResults.push({
              ticker: resolvedStockTickers[i].ticker,
              name: resolvedStockTickers[i].name,
              arguments: result.value.arguments,
            });
          } else if (result.status === 'rejected') {
            const errMsg =
              result.reason instanceof Error ? result.reason.message : String(result.reason);
            console.warn(
              `[pipeline] extractArguments failed for ${resolvedStockTickers[i].ticker}: ${errMsg.slice(0, 200)}`
            );
          }
        }
        stageMeta.argumentsRetries = argMetas.reduce((acc, m) => acc + m.retries, 0);
        stageMeta.argumentsOk = results.some((r) => r.status === 'fulfilled');
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
          source: source ?? null,
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
    stageMeta.supabaseOk = true;
    timings.totalMs = Date.now() - _t0;
    timings.stockCount = resolvedStockTickers.length;
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
      stockTickers: resolvedStockTickers.map((t) => t.ticker),
      sentiment: analysis.sentiment,
      kolId,
      kolName: detectedKolName,
      kolCreated,
      timings: buildStageTimings(timings, stageMeta),
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
