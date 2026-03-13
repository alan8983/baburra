/**
 * Profile Scrape Service — orchestrates KOL profile scraping
 *
 * Connects ProfileExtractors (YouTube channels, Twitter/X profiles) to the import pipeline.
 * Manages scrape jobs: initial discovery, batch processing, and monitoring.
 */

import { youtubeChannelExtractor, twitterProfileExtractor } from '@/infrastructure/extractors';
import type { ProfileExtractor, DiscoveredUrl } from '@/infrastructure/extractors';
import {
  findKolByName,
  createKol,
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
import { getUserTimezone } from '@/infrastructure/repositories/profile.repository';
import { processUrl } from '@/domain/services/import-pipeline.service';
import type { KolCacheEntry } from '@/domain/services/import-pipeline.service';
import type { ScrapeJobType } from '@/domain/models';

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

const profileExtractors: ProfileExtractor[] = [youtubeChannelExtractor, twitterProfileExtractor];

function getProfileExtractor(url: string): ProfileExtractor | null {
  return profileExtractors.find((e) => e.isValidProfileUrl(url)) ?? null;
}

// ── Public Functions ──

export async function discoverProfileUrls(profileUrl: string): Promise<DiscoverResult> {
  const extractor = getProfileExtractor(profileUrl);
  if (!extractor) {
    throw new Error(`Unsupported profile URL: ${profileUrl}`);
  }

  const profile = await extractor.extractProfile(profileUrl);

  return {
    kolName: profile.kolName,
    kolAvatarUrl: profile.kolAvatarUrl,
    platform: extractor.platform,
    platformId: profile.platformId,
    platformUrl: profile.platformUrl,
    discoveredUrls: profile.discoveredUrls ?? profile.postUrls.map((url) => ({ url })),
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
  const kol = existingKol
    ? { id: existingKol.id, name: existingKol.name, created: false }
    : await createKol({
        name: profile.kolName,
        avatarUrl: profile.kolAvatarUrl ?? undefined,
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

  // 6. Create scrape job (use selectedUrls if provided, otherwise all discovered URLs)
  const urlsToScrape = selectedUrls ?? profile.postUrls;
  const job = await createScrapeJob(
    source.id,
    'initial_scrape' as ScrapeJobType,
    userId,
    urlsToScrape
  );

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
      totalUrls: profile.postUrls.length,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
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

  let importedCount = job.importedCount;
  let duplicateCount = job.duplicateCount;
  let errorCount = job.errorCount;
  let processedUrls = job.processedUrls;
  const kolCache = new Map<string, KolCacheEntry>();

  // Process URLs in parallel batches with timeout safeguard
  const remaining = job.discoveredUrls.slice(processedUrls);

  for (let i = 0; i < remaining.length; i += batchSize) {
    // Timeout safeguard: stop if elapsed time exceeds limit
    if (Date.now() - startTime > timeoutMs) {
      break;
    }

    const batch = remaining.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map((url) => processUrl(url, userId, timezone, true, kolCache, kolId))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.status === 'success') {
          importedCount++;
        } else if (result.value.status === 'duplicate') {
          duplicateCount++;
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
    });

    // Check timeout again after batch completes
    if (Date.now() - startTime > timeoutMs) {
      break;
    }
  }

  // Check if done
  const status = processedUrls >= job.totalUrls ? 'completed' : 'processing';

  if (status === 'completed') {
    await completeScrapeJob(jobId, { processedUrls, importedCount, duplicateCount, errorCount });
    await updateScrapeStatus(source.id, 'completed', importedCount);
  }

  return {
    processedUrls,
    totalUrls: job.totalUrls,
    importedCount,
    duplicateCount,
    errorCount,
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

  // Filter to URLs that don't already exist
  const newUrls: string[] = [];
  for (const url of profile.postUrls) {
    const existing = await findPostBySourceUrl(url);
    if (!existing) {
      newUrls.push(url);
    }
  }

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
