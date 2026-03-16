import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock repositories
vi.mock('@/infrastructure/repositories', () => ({
  findKolByName: vi.fn(),
  createKol: vi.fn(),
  findPostBySourceUrl: vi.fn(),
  createPost: vi.fn(),
  getStockByTicker: vi.fn(),
  createStock: vi.fn(),
  consumeAiQuota: vi.fn(),
  findOrCreateSource: vi.fn(),
  getSourceById: vi.fn().mockResolvedValue({
    id: 'source-1',
    kolId: 'kol-1',
    platform: 'youtube',
    platformUrl: 'https://youtube.com/@test',
    scrapeStatus: 'scraping',
    monitorFrequencyHours: 24,
  }),
  updateScrapeStatus: vi.fn(),
  updateNextCheckAt: vi.fn(),
  createScrapeJob: vi.fn(),
  getScrapeJobById: vi.fn(),
  startScrapeJob: vi.fn(),
  updateScrapeJobProgress: vi.fn(),
  completeScrapeJob: vi.fn(),
  failScrapeJob: vi.fn(),
  getQueuedScrapeJobs: vi.fn(),
  getStuckProcessingJobs: vi.fn().mockResolvedValue([]),
  getRetryableFailedJobs: vi.fn().mockResolvedValue([]),
  resetJobToQueued: vi.fn(),
  markPermanentlyFailed: vi.fn(),
}));

vi.mock('@/infrastructure/repositories/profile.repository', () => ({
  getUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

vi.mock('@/domain/services/import-pipeline.service', () => ({
  processUrl: vi.fn(),
}));

vi.mock('@/infrastructure/extractors', () => ({
  youtubeChannelExtractor: {
    platform: 'youtube',
    isValidProfileUrl: vi.fn(),
    extractProfile: vi.fn(),
  },
  twitterProfileExtractor: {
    platform: 'twitter',
    isValidProfileUrl: vi.fn(),
    extractProfile: vi.fn(),
  },
}));

import { processJobBatch } from '../profile-scrape.service';
import { getScrapeJobById, getQueuedScrapeJobs } from '@/infrastructure/repositories';
import { processUrl } from '@/domain/services/import-pipeline.service';

const mockGetScrapeJobById = vi.mocked(getScrapeJobById);
const mockProcessUrl = vi.mocked(processUrl);
const mockGetQueuedScrapeJobs = vi.mocked(getQueuedScrapeJobs);

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    kolSourceId: 'source-1',
    jobType: 'initial_scrape' as const,
    status: 'processing' as const,
    triggeredBy: 'user-1',
    totalUrls: 50,
    processedUrls: 0,
    importedCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    filteredCount: 0,
    discoveredUrls: Array.from({ length: 50 }, (_, i) => `https://youtube.com/watch?v=vid${i}`),
    retryCount: 0,
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Profile Scrape Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process 10 URLs per batch in parallel via Promise.allSettled', async () => {
    const job = makeJob({
      totalUrls: 10,
      discoveredUrls: Array.from({ length: 10 }, (_, i) => `https://youtube.com/watch?v=vid${i}`),
    });
    mockGetScrapeJobById.mockResolvedValue(job);

    // Track concurrent calls
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    mockProcessUrl.mockImplementation(async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((r) => setTimeout(r, 50)); // Simulate 50ms AI processing
      currentConcurrent--;
      return { url: 'test', status: 'success' as const };
    });

    const result = await processJobBatch('job-1', 10);

    expect(result.processedUrls).toBe(10);
    expect(result.importedCount).toBe(10);
    expect(result.status).toBe('completed');
    // All 10 should run concurrently since batch size is 10
    expect(maxConcurrent).toBe(10);
  });

  it('should handle mixed results (some succeed, some fail)', async () => {
    const job = makeJob({
      totalUrls: 10,
      discoveredUrls: Array.from({ length: 10 }, (_, i) => `https://youtube.com/watch?v=vid${i}`),
    });
    mockGetScrapeJobById.mockResolvedValue(job);

    mockProcessUrl.mockImplementation(async (_url) => {
      const urlStr = _url as string;
      const idx = parseInt(urlStr.split('vid')[1]);
      if (idx < 5) return { url: urlStr, status: 'success' as const };
      if (idx < 8) return { url: urlStr, status: 'duplicate' as const };
      throw new Error('AI analysis failed');
    });

    const result = await processJobBatch('job-1', 10);

    expect(result.processedUrls).toBe(10);
    expect(result.importedCount).toBe(5);
    expect(result.duplicateCount).toBe(3);
    expect(result.errorCount).toBe(2);
    expect(result.status).toBe('completed');
  });

  it('should stop processing when timeout is reached', async () => {
    const urls = Array.from({ length: 50 }, (_, i) => `https://youtube.com/watch?v=vid${i}`);
    const job = makeJob({ totalUrls: 50, discoveredUrls: urls });
    mockGetScrapeJobById.mockResolvedValue(job);

    // Each URL takes 200ms — a batch of 10 takes ~200ms parallel
    // With a 500ms timeout, should process ~2-3 batches max
    mockProcessUrl.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { url: 'test', status: 'success' as const };
    });

    const result = await processJobBatch('job-1', 10, 500);

    // Should have stopped before processing all 50
    expect(result.processedUrls).toBeLessThan(50);
    expect(result.processedUrls).toBeGreaterThanOrEqual(10); // At least 1 batch
    expect(result.status).toBe('processing'); // Not completed
  });

  it('should process only 1 job per cron invocation when multiple are queued', async () => {
    // This tests the cron route logic — only 1 job fetched
    mockGetQueuedScrapeJobs.mockResolvedValue([makeJob()]);

    // Verify getQueuedScrapeJobs is called with limit 1
    const { GET } = await import('@/app/api/cron/process-jobs/route');

    const request = new Request('http://localhost/api/cron/process-jobs', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET || 'test-secret'}` },
    });

    // Set env for test
    const origSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-secret';

    const job = makeJob({
      totalUrls: 5,
      discoveredUrls: Array.from({ length: 5 }, (_, i) => `https://youtube.com/watch?v=vid${i}`),
    });
    mockGetScrapeJobById.mockResolvedValue(job);
    mockProcessUrl.mockResolvedValue({ url: 'test', status: 'success' as const });

    try {
      // The cron route calls getQueuedScrapeJobs(1)
      await GET(request as unknown as import('next/server').NextRequest);
      expect(mockGetQueuedScrapeJobs).toHaveBeenCalledWith(1);
    } finally {
      process.env.CRON_SECRET = origSecret;
    }
  });

  it('should process a full 50-URL job across multiple batches', async () => {
    const urls = Array.from({ length: 50 }, (_, i) => `https://youtube.com/watch?v=vid${i}`);
    const job = makeJob({ totalUrls: 50, discoveredUrls: urls });
    mockGetScrapeJobById.mockResolvedValue(job);

    mockProcessUrl.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10)); // Fast 10ms per URL
      return { url: 'test', status: 'success' as const };
    });

    // With 60s timeout, all 50 should complete (5 batches of 10, ~10ms each = ~50ms total)
    const result = await processJobBatch('job-1', 10, 60_000);

    expect(result.processedUrls).toBe(50);
    expect(result.importedCount).toBe(50);
    expect(result.status).toBe('completed');
  });
});
