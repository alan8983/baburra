/**
 * Profile Scrape Service — orchestrates KOL profile scraping
 *
 * Connects ProfileExtractors (YouTube channels, Twitter/X profiles) to the import pipeline.
 * Manages scrape jobs: initial discovery, batch processing, and monitoring.
 */

import {
  youtubeChannelExtractor,
  twitterProfileExtractor,
  tiktokProfileExtractor,
  facebookProfileExtractor,
  youtubeExtractor,
  podcastProfileExtractor,
} from '@/infrastructure/extractors';
import type { ProfileExtractor, DiscoveredUrl } from '@/infrastructure/extractors';
import { composeCost, type Recipe } from '@/domain/models/credit-blocks';
import { consumeCredits } from '@/infrastructure/repositories/ai-usage.repository';

// Per-item recipes used to enrich DiscoveredUrl[].
const APIFY_POST_RECIPE: Recipe = [
  { block: 'scrape.apify.post', units: 1 },
  { block: 'ai.analyze.short', units: 1 },
];
const APIFY_POST_COST = composeCost(APIFY_POST_RECIPE);

// Up-front Apify profile discovery charge.
const APIFY_PROFILE_DISCOVERY_RECIPE: Recipe = [{ block: 'scrape.apify.profile', units: 1 }];
const APIFY_PROFILE_DISCOVERY_COST = composeCost(APIFY_PROFILE_DISCOVERY_RECIPE);

const APIFY_DISCOVERY_PLATFORMS = new Set(['facebook', 'twitter', 'threads', 'tiktok']);

// YouTube scrape concurrency — bounded parallelism for the long-video path.
// See .env.example comment for the tuning rationale.
const YT_CONC_DEFAULT = 3;
const YT_CONC_MIN = 1;
const YT_CONC_MAX = 5;

export function getYoutubeScrapeConcurrency(): number {
  const raw = process.env.YOUTUBE_SCRAPE_CONCURRENCY;
  if (!raw) return YT_CONC_DEFAULT;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return YT_CONC_DEFAULT;
  return Math.max(YT_CONC_MIN, Math.min(YT_CONC_MAX, parsed));
}

/**
 * Minimal p-limit-style semaphore. Starts up to `concurrency` tasks at once
 * and releases a slot as each task settles, so new tasks begin as soon as
 * any running one finishes (unlike chunked `Promise.all` which waits for the
 * slowest task in each batch).
 */
function createLimiter(concurrency: number) {
  const queue: Array<() => void> = [];
  let active = 0;
  const tryNext = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const run = queue.shift()!;
    run();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(
          (v) => {
            active--;
            resolve(v);
            tryNext();
          },
          (e) => {
            active--;
            reject(e);
            tryNext();
          }
        );
      });
      tryNext();
    });
}

function tiktokRecipe(durationSeconds?: number): Recipe {
  // TikTok caption-only is the apify post path; transcription branch adds
  // download.audio.short + transcribe.audio×min. We don't know caption state
  // up-front during discovery, so assume the (more expensive) transcribe path
  // for the estimate, matching prior behaviour.
  const minutes = Math.ceil((durationSeconds || 60) / 60);
  return [
    { block: 'scrape.apify.post', units: 1 },
    { block: 'download.audio.short', units: 1 },
    { block: 'transcribe.audio', units: minutes },
    { block: 'ai.analyze.short', units: 1 },
  ];
}
import {
  findKolByName,
  createKol,
  createKolWithValidation,
  findPostBySourceUrl,
  findOrCreateSource,
  getSourceById,
  updateScrapeStatus,
  updateNextCheckAt,
  createScrapeJob,
  getScrapeJobById,
  startScrapeJob,
  updateScrapeJobProgress,
  completeScrapeJob,
  failScrapeJob,
  getScrapeJobItems,
  updateScrapeJobItemStage,
  reconcileStuckJob,
  retryTerminalWrite,
} from '@/infrastructure/repositories';
import {
  getUserTimezone,
  checkFirstImportFree,
  markFirstImportUsed,
} from '@/infrastructure/repositories/profile.repository';
import { processUrl } from '@/domain/services/import-pipeline.service';
import type { KolCacheEntry } from '@/domain/services/import-pipeline.service';
import type { ScrapeJobItemStage, ScrapeStageMeta, ScrapeOverrides } from '@/domain/models';
import type { ScrapeJobType } from '@/domain/models';
import { updateValidationStatus } from '@/infrastructure/repositories/kol.repository';
import { handleValidationCompletion } from '@/domain/services/kol-validation.service';
import { computeKolScorecard } from '@/domain/services/scorecard.service';

// ── Types ──

export interface InitiateScrapeResult {
  jobId: string;
  kolId: string;
  kolName: string;
  sourceId: string;
  totalUrls: number;
  status: string;
  initialProgress: BatchProgress;
}

export interface BatchProgress {
  processedUrls: number;
  totalUrls: number;
  importedCount: number;
  duplicateCount: number;
  errorCount: number;
  filteredCount: number;
  status: string;
}

export interface DiscoverResult {
  kolName: string;
  kolAvatarUrl: string | null;
  platform: string;
  platformId: string;
  platformUrl: string;
  discoveredUrls: DiscoveredUrl[];
  totalCount: number;
}

export interface IncrementalCheckResult {
  newUrlsFound: number;
  jobId: string | null;
}

// ── Profile Extractor Registry ──

const profileExtractors: ProfileExtractor[] = [
  youtubeChannelExtractor,
  twitterProfileExtractor,
  tiktokProfileExtractor,
  facebookProfileExtractor,
  podcastProfileExtractor,
];

function getProfileExtractor(url: string): ProfileExtractor | null {
  return profileExtractors.find((e) => e.isValidProfileUrl(url)) ?? null;
}

// ── Public Functions ──

export async function discoverProfileUrls(
  profileUrl: string,
  userId?: string
): Promise<DiscoverResult> {
  const extractor = getProfileExtractor(profileUrl);
  if (!extractor) {
    throw new Error(`Unsupported profile URL: ${profileUrl}`);
  }

  // Charge the Apify discovery block UP-FRONT for FB/X/Threads/TikTok before
  // triggering the actor run. Not refunded if 0 items are imported — reflects
  // real Apify spend. RSS-based discovery (YouTube channel, podcast) is NOT
  // billed here; it's covered by the per-item recipe.
  if (userId && APIFY_DISCOVERY_PLATFORMS.has(extractor.platform)) {
    await consumeCredits(userId, APIFY_PROFILE_DISCOVERY_COST, 'apify_profile_discovery');
  }

  const profile = await extractor.extractProfile(profileUrl);
  let discoveredUrls: DiscoveredUrl[] =
    profile.discoveredUrls ?? profile.postUrls.map((url) => ({ url }));

  // Enrich URLs with credit cost recipes + estimates.
  if (extractor.platform === 'youtube') {
    // Check caption availability for each YouTube URL (parallel).
    const enriched = await Promise.all(
      discoveredUrls.map(async (item) => {
        try {
          const availability = await youtubeExtractor.checkCaptionAvailability(item.url);
          return {
            ...item,
            captionAvailable: availability.hasCaptions,
            durationSeconds: availability.estimatedDurationSeconds ?? undefined,
            estimatedCreditCost: availability.estimatedCreditCost,
            recipe: availability.recipe,
          };
        } catch {
          // On error, assume caption branch (cheaper default).
          const fallback: Recipe = [
            { block: 'scrape.youtube_meta', units: 1 },
            { block: 'scrape.youtube_captions', units: 1 },
            { block: 'ai.analyze.short', units: 1 },
          ];
          return {
            ...item,
            estimatedCreditCost: composeCost(fallback),
            recipe: fallback,
          };
        }
      })
    );
    discoveredUrls = enriched;
  } else if (extractor.platform === 'tiktok') {
    discoveredUrls = discoveredUrls.map((item) => {
      const recipe = tiktokRecipe(item.durationSeconds);
      return {
        ...item,
        estimatedCreditCost: composeCost(recipe),
        recipe,
      };
    });
  } else if (
    extractor.platform === 'facebook' ||
    extractor.platform === 'twitter' ||
    extractor.platform === 'threads'
  ) {
    discoveredUrls = discoveredUrls.map((item) => ({
      ...item,
      estimatedCreditCost: APIFY_POST_COST,
      recipe: APIFY_POST_RECIPE,
    }));
  } else if (extractor.platform === 'podcast') {
    // Podcast URLs: recipes already computed by PodcastProfileExtractor.
  } else {
    // Other platforms (e.g. youtube_short surfaced via discovery): leave as-is.
  }

  return {
    kolName: profile.kolName,
    kolAvatarUrl: profile.kolAvatarUrl,
    platform: extractor.platform,
    platformId: profile.platformId,
    platformUrl: profile.platformUrl,
    discoveredUrls,
    totalCount: profile.postUrls.length,
  };
}

export async function initiateProfileScrape(
  profileUrl: string,
  userId: string,
  selectedUrls?: string[],
  overrides?: ScrapeOverrides
): Promise<InitiateScrapeResult> {
  // 1. Detect platform
  const extractor = getProfileExtractor(profileUrl);
  if (!extractor) {
    throw new Error(`Unsupported profile URL: ${profileUrl}`);
  }

  // 2. Extract profile info + video URLs
  const profile = await extractor.extractProfile(profileUrl);

  // 3. Find or create KOL
  const existingKol = await findKolByName(profile.kolName);
  const isNewKol = !existingKol;
  const kol = existingKol
    ? { id: existingKol.id, name: existingKol.name, created: false }
    : await createKolWithValidation({
        name: profile.kolName,
        avatarUrl: profile.kolAvatarUrl ?? undefined,
        validatedBy: overrides?.ownerUserId ?? userId,
      }).then((k) => ({ id: k.id, name: k.name, created: true }));

  // 4. Find or create kol_source
  const source = await findOrCreateSource(
    kol.id,
    extractor.platform,
    profile.platformId,
    profile.platformUrl,
    overrides?.source
  );

  // 5. Update scrape status
  await updateScrapeStatus(source.id, 'scraping');

  // 6. Create scrape job
  // New KOLs get a validation_scrape (limited to 10 posts) to check quality
  const isValidation = isNewKol;
  const jobType: ScrapeJobType = isValidation ? 'validation_scrape' : 'initial_scrape';
  const allUrls = selectedUrls ?? profile.postUrls;
  // Validation scrapes are limited to 10 posts
  const urlsToScrape = isValidation ? allUrls.slice(0, 10) : allUrls;
  const job = await createScrapeJob(source.id, jobType, userId, urlsToScrape);

  // 7. Return immediately — batch processing is driven by the /continue endpoint
  // which the frontend triggers during polling. This avoids Vercel function timeouts.
  return {
    jobId: job.id,
    kolId: kol.id,
    kolName: kol.name,
    sourceId: source.id,
    totalUrls: urlsToScrape.length,
    status: 'queued',
    initialProgress: {
      processedUrls: 0,
      totalUrls: urlsToScrape.length,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      status: 'queued',
    },
  };
}

/**
 * Optional per-URL completion hook. Called after processUrl resolves (with
 * either an ImportUrlResult or an Error). Scripts use this to write per-URL
 * JSONL logs including `timings` without needing to query scrape_job_items.
 * Thrown errors from the hook are swallowed — never break batch processing.
 */
export type UrlCompletionHook = (
  url: string,
  result: import('@/domain/services/import-pipeline.service').ImportUrlResult | null,
  error: Error | null
) => void;

export async function processJobBatch(
  jobId: string,
  batchSize: number = 10,
  timeoutMs: number = 50_000,
  overrides?: ScrapeOverrides,
  onUrlComplete?: UrlCompletionHook
): Promise<BatchProgress> {
  const startTime = Date.now();
  // Self-heal step (#90 / D3): if a previous run committed all per-URL items
  // but failed to flip the parent terminal (network blip, crash between
  // last item and `completeScrapeJob`), `reconcileStuckJob` flips the
  // parent to `completed` using its existing aggregate counters. The
  // subsequent `getScrapeJobById` then sees the post-reconcile state and
  // the early-return below short-circuits cleanly.
  let didReconcile = false;
  try {
    const reconciliation = await reconcileStuckJob(jobId);
    didReconcile = reconciliation.reconciled;
    if (didReconcile) {
      console.warn(
        `[processJobBatch] reconciled stuck job ${jobId} → ${reconciliation.status}`,
        reconciliation.stats
      );
    }
  } catch (reconcileErr) {
    // Reconciler failures are non-blocking; the worst case is we re-do the
    // (now redundant) work in the body below and the regular completion
    // path handles it. Surface the error so operators can spot patterns.
    console.warn(`[processJobBatch] reconcileStuckJob threw for ${jobId}:`, reconcileErr);
  }

  const job = await getScrapeJobById(jobId);
  if (!job) {
    throw new Error(`Scrape job not found: ${jobId}`);
  }

  // Already done (covers both natural completions and reconciled-stuck above).
  if (job.status === 'completed' || job.status === 'failed') {
    // If the reconciler just flipped a `validation_scrape` to terminal, mirror
    // the post-`completeScrapeJob` validation hook the original run would
    // have fired. Best-effort: a thrown error here doesn't roll back the
    // already-committed reconciliation.
    if (didReconcile && job.jobType === 'validation_scrape' && job.kolSourceId) {
      const reconciledSource = await getSourceById(job.kolSourceId);
      if (reconciledSource?.kolId) {
        try {
          await handleValidationCompletion(reconciledSource.kolId);
        } catch (validationErr) {
          console.error(
            `[processJobBatch] reconcile-time validation completion failed for KOL ${reconciledSource.kolId}:`,
            validationErr
          );
        }
      }
    }
    return {
      processedUrls: job.processedUrls,
      totalUrls: job.totalUrls,
      importedCount: job.importedCount,
      duplicateCount: job.duplicateCount,
      errorCount: job.errorCount,
      filteredCount: job.filteredCount,
      status: job.status,
    };
  }

  // Transition from queued to processing
  if (job.status === 'queued') {
    await startScrapeJob(jobId);
  }

  // Resolve KOL source — only present for profile-scrape / validation jobs.
  // Batch-import jobs carry user-supplied URLs with no backing source, so
  // they run with `source = null` and let processUrl auto-detect the KOL
  // per URL (same behavior as /api/import/batch's legacy synchronous path).
  let source: Awaited<ReturnType<typeof getSourceById>> | null = null;
  if (job.kolSourceId) {
    source = await getSourceById(job.kolSourceId);
    if (!source) {
      await failScrapeJob(jobId, 'KOL source not found');
      throw new Error(`KOL source not found: ${job.kolSourceId}`);
    }
  }

  const kolId = source?.kolId;
  const userId = job.triggeredBy ?? 'system';
  const timezone = job.triggeredBy ? await getUserTimezone(job.triggeredBy) : 'UTC';

  const isValidationScrape = job.jobType === 'validation_scrape';

  // Validation scrapes set the KOL to 'validating' status
  if (isValidationScrape && job.status === 'queued' && kolId) {
    await updateValidationStatus(kolId, 'validating');
  }

  // Check first-import-free exemption (matching importBatch behavior)
  // Validation scrapes and overrides with quotaExempt are always quota-exempt
  const isFirstImportFree =
    overrides?.quotaExempt ||
    isValidationScrape ||
    (userId !== 'system' ? await checkFirstImportFree(userId) : false);

  let importedCount = job.importedCount;
  let duplicateCount = job.duplicateCount;
  let errorCount = job.errorCount;
  let filteredCount = job.filteredCount;
  let processedUrls = job.processedUrls;
  const kolCache = new Map<string, KolCacheEntry>();

  // YouTube URLs now run with bounded concurrency (default 3 in-flight) via a
  // p-limit-style semaphore, instead of the old effectiveBatchSize=1 serial
  // branch. Tunable via YOUTUBE_SCRAPE_CONCURRENCY (range 1..5). Non-YouTube
  // platforms keep the caller-supplied batchSize for parallel throughput.
  const isYouTube = job.discoveredUrls.some((u) => u.includes('youtube.com/watch'));
  const effectiveConcurrency = isYouTube ? getYoutubeScrapeConcurrency() : batchSize;
  // YouTube transcription can take up to 600s per video + overhead;
  // use a longer timeout safeguard so we don't cut off mid-transcription.
  const effectiveTimeout = isYouTube ? 650_000 : timeoutMs;

  const remaining = job.discoveredUrls.slice(processedUrls);
  const limit = createLimiter(effectiveConcurrency);

  // Per-URL item rows power the new progress UI. When this job was created
  // without seeded items (legacy path, or a migration hasn't landed yet)
  // we simply skip the per-URL updates and the UI falls back to the
  // aggregate progress bar.
  let urlToItemId = new Map<string, string>();
  try {
    const items = await getScrapeJobItems(jobId);
    urlToItemId = new Map(items.map((item) => [item.url, item.id]));
  } catch (err) {
    console.warn('[profile-scrape] scrape_job_items lookup failed (non-blocking):', err);
  }
  // Serialize stage writes per item so mid-stream byte progress updates
  // can't race with the stage transitions fired around them.
  const itemWriteChains = new Map<string, Promise<void>>();
  const scheduleItemWrite = (itemId: string, work: () => Promise<void>) => {
    const prev = itemWriteChains.get(itemId) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(work)
      .catch((err) => {
        console.warn(`[profile-scrape] item stage update failed for ${itemId}:`, err);
      });
    itemWriteChains.set(itemId, next);
  };

  // Serialize progress writes so near-simultaneous task completions can't
  // race last-write-wins. Each write carries a complete snapshot of the
  // counters at the moment `flushProgress` was called, preserving monotonic
  // ordering at the DB.
  let progressInFlight: Promise<void> = Promise.resolve();
  const flushProgress = () => {
    const snapshot = {
      processedUrls,
      importedCount,
      duplicateCount,
      errorCount,
      filteredCount,
    };
    progressInFlight = progressInFlight
      .catch(() => {})
      .then(() => updateScrapeJobProgress(jobId, snapshot))
      .catch((err) => {
        console.warn('[profile-scrape] progress update failed:', err);
      });
  };

  let aborted = false;

  await Promise.all(
    remaining.map((url) =>
      limit(async () => {
        // Timeout safeguard: stop scheduling new work once budget is exhausted.
        if (aborted) return;
        if (Date.now() - startTime > effectiveTimeout) {
          aborted = true;
          return;
        }

        const itemId = urlToItemId.get(url);
        const itemStageCallback = itemId
          ? (stage: ScrapeJobItemStage, meta?: ScrapeStageMeta) => {
              scheduleItemWrite(itemId, () => updateScrapeJobItemStage(itemId, stage, meta));
            }
          : undefined;

        try {
          const value = await processUrl(
            url,
            userId,
            timezone,
            isFirstImportFree,
            kolCache,
            kolId,
            itemStageCallback,
            overrides?.source ?? null
          );
          if (value.status === 'success') {
            importedCount++;
          } else if (value.status === 'duplicate' || value.status === 'mirror_linked') {
            duplicateCount++;
          } else if (value.status === 'error' && value.error === 'no_tickers_identified') {
            filteredCount++;
          } else {
            errorCount++;
          }
          if (onUrlComplete) {
            try {
              onUrlComplete(url, value, null);
            } catch (hookErr) {
              console.warn('[processJobBatch] onUrlComplete threw:', hookErr);
            }
          }
        } catch (err) {
          errorCount++;
          // processUrl already emits 'failed' on throws, but the catch
          // here guarantees a terminal stage even if the callback itself
          // threw earlier in the pipeline.
          if (itemId) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            scheduleItemWrite(itemId, () =>
              updateScrapeJobItemStage(itemId, 'failed', { errorMessage })
            );
          }
          if (onUrlComplete) {
            try {
              onUrlComplete(url, null, err instanceof Error ? err : new Error(String(err)));
            } catch (hookErr) {
              console.warn('[processJobBatch] onUrlComplete threw:', hookErr);
            }
          }
        }

        processedUrls++;
        flushProgress();
      })
    )
  );

  // Ensure the last progress snapshot lands before we read back for the
  // final status decision.
  await progressInFlight;
  // Drain any pending per-item stage writes so the UI reflects final state
  // before we flip the job to `completed` / `processing`.
  await Promise.all(Array.from(itemWriteChains.values()).map((p) => p.catch(() => {})));

  // Mark first import as used if this was the free first import
  // Skip for override-exempt calls (e.g. seed script) to avoid touching the platform user profile.
  if (isFirstImportFree && !overrides?.quotaExempt && importedCount > 0 && userId !== 'system') {
    await markFirstImportUsed(userId);
  }

  // Check if done
  const status = processedUrls >= job.totalUrls ? 'completed' : 'processing';

  if (status === 'completed') {
    await completeScrapeJob(jobId, {
      processedUrls,
      importedCount,
      duplicateCount,
      errorCount,
      filteredCount,
    });
    // Batch-import jobs have no backing source to mark as completed.
    // Wrapped in retryTerminalWrite so a transient blip on this final
    // kol_sources update doesn't leave the source's `scrape_status` lagging
    // behind the job's `completed` status. (#90 / D3 — task 2.4.)
    if (source) {
      await retryTerminalWrite(
        () => updateScrapeStatus(source.id, 'completed', importedCount),
        `updateScrapeStatus(${source.id}, completed)`
      );
    }

    // Trigger validation scoring for validation scrape jobs
    if (isValidationScrape && kolId) {
      try {
        await handleValidationCompletion(kolId);
      } catch (validationErr) {
        console.error(`Validation scoring failed for KOL ${kolId}:`, validationErr);
      }
    }

    // Per R11: synchronously recompute the KOL scorecard so the cache is
    // warm before the user opens the detail page. The fire-and-forget
    // read-through path is too lossy when ~30 Tiingo calls have to land
    // in a single response budget. Skip for batch-import jobs (no kolId).
    // Failure here is logged but does not flip the scrape job's status.
    if (kolId) {
      try {
        await computeKolScorecard(kolId);
      } catch (scorecardErr) {
        console.warn(
          `[profile-scrape] computeKolScorecard(${kolId}) failed after completeScrapeJob:`,
          scorecardErr instanceof Error ? scorecardErr.message : scorecardErr
        );
      }
    }
  }

  return {
    processedUrls,
    totalUrls: job.totalUrls,
    importedCount,
    duplicateCount,
    errorCount,
    filteredCount,
    status,
  };
}

export async function checkForNewContent(sourceId: string): Promise<IncrementalCheckResult> {
  const source = await getSourceById(sourceId);
  if (!source) {
    throw new Error(`KOL source not found: ${sourceId}`);
  }

  // Get the appropriate extractor
  const extractor = profileExtractors.find((e) => e.platform === source.platform);
  if (!extractor) {
    throw new Error(`No extractor for platform: ${source.platform}`);
  }

  // Extract latest post URLs
  const profile = await extractor.extractProfile(source.platformUrl);

  // Filter to URLs that don't already exist (parallel for speed)
  const existChecks = await Promise.all(
    profile.postUrls.map(async (url) => ({
      url,
      exists: !!(await findPostBySourceUrl(url)),
    }))
  );
  const newUrls = existChecks.filter((c) => !c.exists).map((c) => c.url);

  // Update monitoring timestamps
  const nextCheckAt = new Date();
  nextCheckAt.setHours(nextCheckAt.getHours() + source.monitorFrequencyHours);
  await updateScrapeStatus(sourceId, source.scrapeStatus);
  await updateNextCheckAt(sourceId, nextCheckAt);

  if (newUrls.length === 0) {
    return { newUrlsFound: 0, jobId: null };
  }

  // Create incremental job for new URLs
  const job = await createScrapeJob(sourceId, 'incremental_check' as ScrapeJobType, null, newUrls);

  return { newUrlsFound: newUrls.length, jobId: job.id };
}
