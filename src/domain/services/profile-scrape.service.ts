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
} from '@/infrastructure/repositories';
import {
  getUserTimezone,
  checkFirstImportFree,
  markFirstImportUsed,
} from '@/infrastructure/repositories/profile.repository';
import { processUrl } from '@/domain/services/import-pipeline.service';
import type { KolCacheEntry } from '@/domain/services/import-pipeline.service';
import type { ScrapeJobType } from '@/domain/models';
import { updateValidationStatus } from '@/infrastructure/repositories/kol.repository';
import { handleValidationCompletion } from '@/domain/services/kol-validation.service';

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
  selectedUrls?: string[]
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
        validatedBy: userId,
      }).then((k) => ({ id: k.id, name: k.name, created: true }));

  // 4. Find or create kol_source
  const source = await findOrCreateSource(
    kol.id,
    extractor.platform,
    profile.platformId,
    profile.platformUrl
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

export async function processJobBatch(
  jobId: string,
  batchSize: number = 10,
  timeoutMs: number = 50_000
): Promise<BatchProgress> {
  const startTime = Date.now();
  const job = await getScrapeJobById(jobId);
  if (!job) {
    throw new Error(`Scrape job not found: ${jobId}`);
  }

  // Already done
  if (job.status === 'completed' || job.status === 'failed') {
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

  // Get the KOL ID from the source
  const source = await getSourceById(job.kolSourceId);
  if (!source) {
    await failScrapeJob(jobId, 'KOL source not found');
    throw new Error(`KOL source not found: ${job.kolSourceId}`);
  }

  const kolId = source.kolId;
  const userId = job.triggeredBy ?? 'system';
  const timezone = job.triggeredBy ? await getUserTimezone(job.triggeredBy) : 'UTC';

  const isValidationScrape = job.jobType === 'validation_scrape';

  // Validation scrapes set the KOL to 'validating' status
  if (isValidationScrape && job.status === 'queued') {
    await updateValidationStatus(kolId, 'validating');
  }

  // Check first-import-free exemption (matching importBatch behavior)
  // Validation scrapes are always quota-exempt
  const isFirstImportFree =
    isValidationScrape || (userId !== 'system' ? await checkFirstImportFree(userId) : false);

  let importedCount = job.importedCount;
  let duplicateCount = job.duplicateCount;
  let errorCount = job.errorCount;
  let filteredCount = job.filteredCount;
  let processedUrls = job.processedUrls;
  const kolCache = new Map<string, KolCacheEntry>();

  // YouTube URLs may need Gemini transcription (up to 10 min for long videos),
  // so process them one at a time. Non-YouTube URLs use the caller-provided
  // batchSize for parallel throughput.
  const isYouTube = job.discoveredUrls.some((u) => u.includes('youtube.com/watch'));
  const effectiveBatchSize = isYouTube ? 1 : batchSize;
  // YouTube transcription can take up to 600s per video + overhead;
  // use a longer timeout safeguard so we don't cut off mid-transcription.
  const effectiveTimeout = isYouTube ? 650_000 : timeoutMs;

  // Process URLs in parallel batches with timeout safeguard
  const remaining = job.discoveredUrls.slice(processedUrls);

  for (let i = 0; i < remaining.length; i += effectiveBatchSize) {
    // Timeout safeguard: stop if elapsed time exceeds limit
    if (Date.now() - startTime > effectiveTimeout) {
      break;
    }

    const batch = remaining.slice(i, i + effectiveBatchSize);

    const results = await Promise.allSettled(
      batch.map((url) => processUrl(url, userId, timezone, isFirstImportFree, kolCache, kolId))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.status === 'success') {
          importedCount++;
        } else if (result.value.status === 'duplicate') {
          duplicateCount++;
        } else if (
          result.value.status === 'error' &&
          result.value.error === 'no_tickers_identified'
        ) {
          filteredCount++;
        } else {
          errorCount++;
        }
      } else {
        errorCount++;
      }
      processedUrls++;
    }

    // Update progress after each parallel batch
    await updateScrapeJobProgress(jobId, {
      processedUrls,
      importedCount,
      duplicateCount,
      errorCount,
      filteredCount,
    });

    // Check timeout again after batch completes
    if (Date.now() - startTime > timeoutMs) {
      break;
    }
  }

  // Mark first import as used if this was the free first import
  if (isFirstImportFree && importedCount > 0 && userId !== 'system') {
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
    await updateScrapeStatus(source.id, 'completed', importedCount);

    // Trigger validation scoring for validation scrape jobs
    if (isValidationScrape) {
      try {
        await handleValidationCompletion(kolId);
      } catch (validationErr) {
        console.error(`Validation scoring failed for KOL ${kolId}:`, validationErr);
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
