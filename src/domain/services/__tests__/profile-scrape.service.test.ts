import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mocks ──

const mocks = vi.hoisted(() => ({
  // Repositories
  findKolByName: vi.fn(),
  createKol: vi.fn(),
  createKolWithValidation: vi.fn(),
  findPostBySourceUrl: vi.fn(),
  findOrCreateSource: vi.fn(),
  getSourceById: vi.fn(),
  updateScrapeStatus: vi.fn(),
  updateNextCheckAt: vi.fn(),
  createScrapeJob: vi.fn(),
  getScrapeJobById: vi.fn(),
  startScrapeJob: vi.fn(),
  updateScrapeJobProgress: vi.fn(),
  completeScrapeJob: vi.fn(),
  failScrapeJob: vi.fn(),
  getUserTimezone: vi.fn(),
  checkFirstImportFree: vi.fn(),
  markFirstImportUsed: vi.fn(),
  updateValidationStatus: vi.fn(),
  handleValidationCompletion: vi.fn(),
  // Extractors
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
  podcastProfileExtractor: {
    platform: 'podcast',
    isValidProfileUrl: vi.fn(),
    extractProfile: vi.fn(),
  },
  // Import pipeline
  processUrl: vi.fn(),
  // Scorecard recompute (R11): synchronous post-completion call.
  computeKolScorecard: vi.fn().mockResolvedValue(undefined),
  // #90 / D3 — terminal-state hardening helpers
  // Default to "nothing to reconcile" so the existing happy-path tests
  // continue through `processJobBatch` without short-circuiting.
  reconcileStuckJob: vi.fn().mockResolvedValue({ reconciled: false }),
  retryTerminalWrite: vi.fn(),
}));

vi.mock('@/infrastructure/repositories', () => ({
  findKolByName: mocks.findKolByName,
  createKol: mocks.createKol,
  createKolWithValidation: mocks.createKolWithValidation,
  findPostBySourceUrl: mocks.findPostBySourceUrl,
  findOrCreateSource: mocks.findOrCreateSource,
  getSourceById: mocks.getSourceById,
  updateScrapeStatus: mocks.updateScrapeStatus,
  updateNextCheckAt: mocks.updateNextCheckAt,
  createScrapeJob: mocks.createScrapeJob,
  getScrapeJobById: mocks.getScrapeJobById,
  startScrapeJob: mocks.startScrapeJob,
  updateScrapeJobProgress: mocks.updateScrapeJobProgress,
  completeScrapeJob: mocks.completeScrapeJob,
  failScrapeJob: mocks.failScrapeJob,
  getScrapeJobItems: vi.fn().mockResolvedValue([]),
  updateScrapeJobItemStage: vi.fn().mockResolvedValue(undefined),
  createScrapeJobItems: vi.fn().mockResolvedValue([]),
  failScrapeJobItem: vi.fn().mockResolvedValue(undefined),
  updateScrapeJobItemDownloadProgress: vi.fn().mockResolvedValue(undefined),
  reconcileStuckJob: mocks.reconcileStuckJob,
  // Pass through the underlying call so the test's existing assertions
  // against `updateScrapeStatus` still observe the call site directly.
  retryTerminalWrite: <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock('@/infrastructure/repositories/profile.repository', () => ({
  getUserTimezone: mocks.getUserTimezone,
  checkFirstImportFree: mocks.checkFirstImportFree,
  markFirstImportUsed: mocks.markFirstImportUsed,
}));

vi.mock('@/infrastructure/repositories/kol.repository', () => ({
  updateValidationStatus: mocks.updateValidationStatus,
}));

vi.mock('@/domain/services/kol-validation.service', () => ({
  handleValidationCompletion: mocks.handleValidationCompletion,
}));

vi.mock('@/infrastructure/extractors', () => ({
  youtubeChannelExtractor: mocks.youtubeChannelExtractor,
  twitterProfileExtractor: mocks.twitterProfileExtractor,
  tiktokProfileExtractor: {
    platform: 'tiktok',
    isValidProfileUrl: vi.fn(),
    extractProfile: vi.fn(),
  },
  facebookProfileExtractor: {
    platform: 'facebook',
    isValidProfileUrl: vi.fn(),
    extractProfile: vi.fn(),
  },
  podcastProfileExtractor: mocks.podcastProfileExtractor,
}));

vi.mock('@/domain/services/import-pipeline.service', () => ({
  processUrl: mocks.processUrl,
}));

vi.mock('@/domain/services/scorecard.service', () => ({
  computeKolScorecard: mocks.computeKolScorecard,
}));

const aiUsageMocks = vi.hoisted(() => ({ consumeCredits: vi.fn() }));
vi.mock('@/infrastructure/repositories/ai-usage.repository', () => ({
  consumeCredits: aiUsageMocks.consumeCredits,
}));

import {
  initiateProfileScrape,
  processJobBatch,
  checkForNewContent,
  discoverProfileUrls,
} from '../profile-scrape.service';

// ── Helpers ──

const USER_ID = 'user-123';

function mockProfile(overrides = {}) {
  return {
    kolName: 'TraderJoe',
    kolAvatarUrl: 'https://img.example.com/avatar.jpg',
    platformId: 'UC123',
    platformUrl: 'https://youtube.com/@traderjoe',
    postUrls: [
      'https://youtube.com/watch?v=vid1',
      'https://youtube.com/watch?v=vid2',
      'https://youtube.com/watch?v=vid3',
    ],
    ...overrides,
  };
}

function mockSource(overrides = {}) {
  return {
    id: 'source-1',
    kolId: 'kol-1',
    platform: 'youtube',
    platformId: 'UC123',
    platformUrl: 'https://youtube.com/@traderjoe',
    scrapeStatus: 'idle',
    monitorFrequencyHours: 24,
    monitoringEnabled: true,
    lastScrapedAt: null,
    postsScrapedCount: 0,
    nextCheckAt: null,
    source: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ──

describe('initiateProfileScrape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: YouTube extractor matches
    mocks.youtubeChannelExtractor.isValidProfileUrl.mockReturnValue(true);
    mocks.twitterProfileExtractor.isValidProfileUrl.mockReturnValue(false);
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(mockProfile());
    mocks.findKolByName.mockResolvedValue(null);
    mocks.createKolWithValidation.mockResolvedValue({ id: 'kol-new', name: 'TraderJoe' });
    mocks.findOrCreateSource.mockResolvedValue(mockSource());
    mocks.updateScrapeStatus.mockResolvedValue(undefined);
    mocks.createScrapeJob.mockResolvedValue({ id: 'job-1' });
  });

  it('throws for unsupported profile URL', async () => {
    mocks.youtubeChannelExtractor.isValidProfileUrl.mockReturnValue(false);
    mocks.twitterProfileExtractor.isValidProfileUrl.mockReturnValue(false);

    await expect(initiateProfileScrape('https://instagram.com/user', USER_ID)).rejects.toThrow(
      'Unsupported profile URL'
    );
  });

  it('calls the correct extractor for YouTube channel URL', async () => {
    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);
    expect(mocks.youtubeChannelExtractor.extractProfile).toHaveBeenCalledWith(
      'https://youtube.com/@traderjoe'
    );
  });

  it('calls the correct extractor for Twitter profile URL', async () => {
    mocks.youtubeChannelExtractor.isValidProfileUrl.mockReturnValue(false);
    mocks.twitterProfileExtractor.isValidProfileUrl.mockReturnValue(true);
    mocks.twitterProfileExtractor.extractProfile.mockResolvedValue(
      mockProfile({ platform: 'twitter', platformUrl: 'https://x.com/traderjoe' })
    );

    await initiateProfileScrape('https://x.com/traderjoe', USER_ID);
    expect(mocks.twitterProfileExtractor.extractProfile).toHaveBeenCalledWith(
      'https://x.com/traderjoe'
    );
  });

  it('creates a new KOL when none exists', async () => {
    mocks.findKolByName.mockResolvedValue(null);

    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.findKolByName).toHaveBeenCalledWith('TraderJoe');
    expect(mocks.createKolWithValidation).toHaveBeenCalledWith({
      name: 'TraderJoe',
      avatarUrl: 'https://img.example.com/avatar.jpg',
      validatedBy: USER_ID,
    });
  });

  it('reuses existing KOL and does not call createKolWithValidation', async () => {
    mocks.findKolByName.mockResolvedValue({ id: 'kol-existing', name: 'TraderJoe' });

    const result = await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.createKolWithValidation).not.toHaveBeenCalled();
    expect(result.kolId).toBe('kol-existing');
  });

  it('calls findOrCreateSource with correct args (no overrides)', async () => {
    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.findOrCreateSource).toHaveBeenCalledWith(
      'kol-new',
      'youtube',
      'UC123',
      'https://youtube.com/@traderjoe',
      undefined
    );
  });

  it('updates scrape status to scraping', async () => {
    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.updateScrapeStatus).toHaveBeenCalledWith('source-1', 'scraping');
  });

  it('creates validation_scrape job for new KOL', async () => {
    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.createScrapeJob).toHaveBeenCalledWith(
      'source-1',
      'validation_scrape',
      USER_ID,
      expect.arrayContaining(['https://youtube.com/watch?v=vid1'])
    );
  });

  it('creates initial_scrape job for existing KOL', async () => {
    mocks.findKolByName.mockResolvedValue({ id: 'kol-existing', name: 'TraderJoe' });

    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.createScrapeJob).toHaveBeenCalledWith(
      'source-1',
      'initial_scrape',
      USER_ID,
      expect.arrayContaining(['https://youtube.com/watch?v=vid1'])
    );
  });

  it('returns correct InitiateScrapeResult shape', async () => {
    const result = await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(result).toEqual({
      jobId: 'job-1',
      kolId: 'kol-new',
      kolName: 'TraderJoe',
      sourceId: 'source-1',
      totalUrls: 3,
      status: 'queued',
      initialProgress: {
        processedUrls: 0,
        totalUrls: 3,
        importedCount: 0,
        duplicateCount: 0,
        errorCount: 0,
        filteredCount: 0,
        status: 'queued',
      },
    });
  });

  it('handles extractor returning empty postUrls', async () => {
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(mockProfile({ postUrls: [] }));

    const result = await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(result.totalUrls).toBe(0);
    expect(result.initialProgress.totalUrls).toBe(0);
  });

  it('handles null kolAvatarUrl by passing undefined to createKolWithValidation', async () => {
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(
      mockProfile({ kolAvatarUrl: null })
    );

    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.createKolWithValidation).toHaveBeenCalledWith({
      name: 'TraderJoe',
      avatarUrl: undefined,
      validatedBy: USER_ID,
    });
  });
});

// ── ScrapeOverrides ──

describe('ScrapeOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.youtubeChannelExtractor.isValidProfileUrl.mockReturnValue(true);
    mocks.twitterProfileExtractor.isValidProfileUrl.mockReturnValue(false);
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(mockProfile());
    mocks.findKolByName.mockResolvedValue(null);
    mocks.createKolWithValidation.mockResolvedValue({ id: 'kol-new', name: 'TraderJoe' });
    mocks.findOrCreateSource.mockResolvedValue(mockSource());
    mocks.updateScrapeStatus.mockResolvedValue(undefined);
    mocks.createScrapeJob.mockResolvedValue({ id: 'job-1' });
  });

  it('passes source override to findOrCreateSource', async () => {
    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID, undefined, {
      source: 'seed',
    });

    expect(mocks.findOrCreateSource).toHaveBeenCalledWith(
      'kol-new',
      'youtube',
      'UC123',
      'https://youtube.com/@traderjoe',
      'seed'
    );
  });

  it('passes ownerUserId to createKolWithValidation', async () => {
    const PLATFORM_ID = 'a0000000-0000-4000-8000-000000000001';
    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID, undefined, {
      ownerUserId: PLATFORM_ID,
    });

    expect(mocks.createKolWithValidation).toHaveBeenCalledWith({
      name: 'TraderJoe',
      avatarUrl: 'https://img.example.com/avatar.jpg',
      validatedBy: PLATFORM_ID,
    });
  });

  it('quotaExempt override makes processJobBatch skip credit checks', async () => {
    mocks.getScrapeJobById.mockResolvedValue({
      id: 'job-seed',
      kolSourceId: 'source-1',
      status: 'queued',
      jobType: 'initial_scrape',
      discoveredUrls: ['https://youtube.com/watch?v=vid1'],
      totalUrls: 1,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-new' }));
    mocks.startScrapeJob.mockResolvedValue(undefined);
    mocks.updateScrapeJobProgress.mockResolvedValue(undefined);
    mocks.completeScrapeJob.mockResolvedValue(undefined);
    mocks.getUserTimezone.mockResolvedValue('UTC');
    mocks.checkFirstImportFree.mockResolvedValue(false);
    mocks.processUrl.mockResolvedValue({ status: 'success' });

    await processJobBatch('job-seed', 10, 50_000, { quotaExempt: true });

    // processUrl should receive quotaExempt=true (4th arg)
    expect(mocks.processUrl).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=vid1',
      USER_ID,
      'UTC',
      true, // quotaExempt
      expect.any(Map),
      'kol-new',
      undefined, // no scrape_job_items → no stage callback
      null // no overrides.source provided
    );
    // checkFirstImportFree should not be called since quotaExempt shortcuts the check
    expect(mocks.checkFirstImportFree).not.toHaveBeenCalled();
  });

  it('quotaExempt override prevents markFirstImportUsed', async () => {
    mocks.getScrapeJobById.mockResolvedValue({
      id: 'job-seed',
      kolSourceId: 'source-1',
      status: 'queued',
      jobType: 'initial_scrape',
      discoveredUrls: ['https://youtube.com/watch?v=vid1'],
      totalUrls: 1,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-new' }));
    mocks.startScrapeJob.mockResolvedValue(undefined);
    mocks.updateScrapeJobProgress.mockResolvedValue(undefined);
    mocks.completeScrapeJob.mockResolvedValue(undefined);
    mocks.getUserTimezone.mockResolvedValue('UTC');
    mocks.processUrl.mockResolvedValue({ status: 'success' });

    await processJobBatch('job-seed', 10, 50_000, { quotaExempt: true });

    expect(mocks.markFirstImportUsed).not.toHaveBeenCalled();
  });
});

describe('checkForNewContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T10:00:00Z'));
    mocks.getSourceById.mockResolvedValue(mockSource());
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(mockProfile());
    mocks.findPostBySourceUrl.mockResolvedValue(null); // all URLs are new by default
    mocks.createScrapeJob.mockResolvedValue({ id: 'job-new' });
    mocks.updateScrapeStatus.mockResolvedValue(undefined);
    mocks.updateNextCheckAt.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when source not found', async () => {
    mocks.getSourceById.mockResolvedValue(null);
    await expect(checkForNewContent('source-x')).rejects.toThrow('KOL source not found');
  });

  it('throws when no extractor matches source platform', async () => {
    mocks.getSourceById.mockResolvedValue(mockSource({ platform: 'instagram' }));
    await expect(checkForNewContent('source-1')).rejects.toThrow('No extractor for platform');
  });

  it('calls extractProfile with source platformUrl', async () => {
    await checkForNewContent('source-1');
    expect(mocks.youtubeChannelExtractor.extractProfile).toHaveBeenCalledWith(
      'https://youtube.com/@traderjoe'
    );
  });

  it('filters out existing URLs', async () => {
    // First two URLs already exist, third is new
    mocks.findPostBySourceUrl
      .mockResolvedValueOnce({ id: 'existing-1' })
      .mockResolvedValueOnce({ id: 'existing-2' })
      .mockResolvedValueOnce(null);

    const result = await checkForNewContent('source-1');

    expect(result.newUrlsFound).toBe(1);
    expect(mocks.createScrapeJob).toHaveBeenCalledWith('source-1', 'incremental_check', null, [
      'https://youtube.com/watch?v=vid3',
    ]);
  });

  it('returns no new URLs and null jobId when all exist', async () => {
    mocks.findPostBySourceUrl.mockResolvedValue({ id: 'existing' });

    const result = await checkForNewContent('source-1');

    expect(result).toEqual({ newUrlsFound: 0, jobId: null });
    expect(mocks.createScrapeJob).not.toHaveBeenCalled();
  });

  it('creates incremental_check job with only new URLs', async () => {
    const result = await checkForNewContent('source-1');

    expect(result.newUrlsFound).toBe(3);
    expect(result.jobId).toBe('job-new');
    expect(mocks.createScrapeJob).toHaveBeenCalledWith(
      'source-1',
      'incremental_check',
      null,
      expect.arrayContaining([
        'https://youtube.com/watch?v=vid1',
        'https://youtube.com/watch?v=vid2',
        'https://youtube.com/watch?v=vid3',
      ])
    );
  });

  it('updates nextCheckAt based on monitorFrequencyHours', async () => {
    await checkForNewContent('source-1');

    const expectedNext = new Date('2026-03-14T10:00:00Z'); // +24 hours
    expect(mocks.updateNextCheckAt).toHaveBeenCalledWith('source-1', expectedNext);
  });

  it('calls updateScrapeStatus to maintain current status', async () => {
    await checkForNewContent('source-1');
    expect(mocks.updateScrapeStatus).toHaveBeenCalledWith('source-1', 'idle');
  });
});

// ── 11.1: Validation flow integration ──

describe('validation scrape flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.youtubeChannelExtractor.isValidProfileUrl.mockReturnValue(true);
    mocks.twitterProfileExtractor.isValidProfileUrl.mockReturnValue(false);
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(mockProfile());
    mocks.findKolByName.mockResolvedValue(null); // new KOL
    mocks.createKolWithValidation.mockResolvedValue({ id: 'kol-new', name: 'TraderJoe' });
    mocks.findOrCreateSource.mockResolvedValue(mockSource());
    mocks.updateScrapeStatus.mockResolvedValue(undefined);
    mocks.createScrapeJob.mockResolvedValue({ id: 'job-val' });
    mocks.getScrapeJobById.mockResolvedValue({
      id: 'job-val',
      kolSourceId: 'source-1',
      status: 'queued',
      jobType: 'validation_scrape',
      discoveredUrls: ['https://youtube.com/watch?v=vid1', 'https://youtube.com/watch?v=vid2'],
      totalUrls: 2,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-new' }));
    mocks.startScrapeJob.mockResolvedValue(undefined);
    mocks.updateScrapeJobProgress.mockResolvedValue(undefined);
    mocks.completeScrapeJob.mockResolvedValue(undefined);
    mocks.updateValidationStatus.mockResolvedValue(undefined);
    mocks.handleValidationCompletion.mockResolvedValue(undefined);
    mocks.getUserTimezone.mockResolvedValue('Asia/Taipei');
    mocks.checkFirstImportFree.mockResolvedValue(false);
    mocks.processUrl.mockResolvedValue({ status: 'success' });
  });

  it('new KOL nomination creates validation_scrape job', async () => {
    const result = await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(result.jobId).toBe('job-val');
    expect(mocks.createKolWithValidation).toHaveBeenCalledWith({
      name: 'TraderJoe',
      avatarUrl: 'https://img.example.com/avatar.jpg',
      validatedBy: USER_ID,
    });
    expect(mocks.createScrapeJob).toHaveBeenCalledWith(
      'source-1',
      'validation_scrape',
      USER_ID,
      expect.any(Array)
    );
  });

  it('validation scrape limits to 10 URLs', async () => {
    const manyUrls = Array.from({ length: 20 }, (_, i) => `https://youtube.com/watch?v=vid${i}`);
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(
      mockProfile({ postUrls: manyUrls })
    );

    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    const passedUrls = mocks.createScrapeJob.mock.calls[0][3];
    expect(passedUrls).toHaveLength(10);
  });

  it('processJobBatch sets KOL to validating status', async () => {
    await processJobBatch('job-val', 10, 50_000);

    expect(mocks.updateValidationStatus).toHaveBeenCalledWith('kol-new', 'validating');
  });

  it('processJobBatch triggers handleValidationCompletion on completion', async () => {
    await processJobBatch('job-val', 10, 50_000);

    expect(mocks.handleValidationCompletion).toHaveBeenCalledWith('kol-new');
  });

  it('validation scrape is quota-exempt (skips first-import check)', async () => {
    await processJobBatch('job-val', 10, 50_000);

    // checkFirstImportFree should NOT be called since validation scrapes are always exempt
    expect(mocks.checkFirstImportFree).not.toHaveBeenCalled();
  });

  it('existing KOL re-scrape creates initial_scrape, not validation_scrape', async () => {
    mocks.findKolByName.mockResolvedValue({ id: 'kol-existing', name: 'TraderJoe' });

    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.createScrapeJob).toHaveBeenCalledWith(
      'source-1',
      'initial_scrape',
      USER_ID,
      expect.any(Array)
    );
  });
});

// ── 11.2: Backward compatibility ──

describe('backward compatibility', () => {
  it('existing KOL scrape does not call createKolWithValidation', async () => {
    vi.clearAllMocks();
    mocks.youtubeChannelExtractor.isValidProfileUrl.mockReturnValue(true);
    mocks.twitterProfileExtractor.isValidProfileUrl.mockReturnValue(false);
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(mockProfile());
    mocks.findKolByName.mockResolvedValue({ id: 'kol-existing', name: 'TraderJoe' });
    mocks.findOrCreateSource.mockResolvedValue(mockSource());
    mocks.updateScrapeStatus.mockResolvedValue(undefined);
    mocks.createScrapeJob.mockResolvedValue({ id: 'job-1' });

    const result = await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.createKolWithValidation).not.toHaveBeenCalled();
    expect(result.kolId).toBe('kol-existing');
  });

  it('non-validation job does not trigger handleValidationCompletion', async () => {
    vi.clearAllMocks();
    mocks.getScrapeJobById.mockResolvedValue({
      id: 'job-normal',
      kolSourceId: 'source-1',
      status: 'queued',
      jobType: 'initial_scrape',
      discoveredUrls: ['https://youtube.com/watch?v=vid1'],
      totalUrls: 1,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-existing' }));
    mocks.startScrapeJob.mockResolvedValue(undefined);
    mocks.updateScrapeJobProgress.mockResolvedValue(undefined);
    mocks.completeScrapeJob.mockResolvedValue(undefined);
    mocks.getUserTimezone.mockResolvedValue('UTC');
    mocks.checkFirstImportFree.mockResolvedValue(false);
    mocks.processUrl.mockResolvedValue({ status: 'success' });

    await processJobBatch('job-normal', 10, 50_000);

    expect(mocks.handleValidationCompletion).not.toHaveBeenCalled();
    expect(mocks.updateValidationStatus).not.toHaveBeenCalled();
  });
});

// ── #90 / D3: stuck-job reconciler at processJobBatch entry ──

describe('processJobBatch self-heal via reconcileStuckJob (#90 / D3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-arm the default after clearAllMocks wipes the implementation.
    mocks.reconcileStuckJob.mockResolvedValue({ reconciled: false });
    mocks.getUserTimezone.mockResolvedValue('UTC');
    mocks.checkFirstImportFree.mockResolvedValue(false);
    mocks.processUrl.mockResolvedValue({ status: 'success' });
    mocks.startScrapeJob.mockResolvedValue(undefined);
    mocks.updateScrapeJobProgress.mockResolvedValue(undefined);
    mocks.completeScrapeJob.mockResolvedValue(undefined);
    mocks.updateScrapeStatus.mockResolvedValue(undefined);
  });

  it('returns reconciled stats early without calling processUrl when reconciler self-heals a stuck job', async () => {
    // Simulate: prior run committed all 3 items (counts already in the row)
    // but crashed before `completeScrapeJob` flipped status. The reconciler
    // detects this and flips the parent terminal.
    mocks.reconcileStuckJob.mockResolvedValueOnce({
      reconciled: true,
      status: 'completed',
      stats: {
        processedUrls: 3,
        totalUrls: 3,
        importedCount: 2,
        duplicateCount: 0,
        errorCount: 1,
        filteredCount: 0,
      },
    });
    // After reconcile flips status, the subsequent getScrapeJobById sees
    // `completed` and the existing early-return path returns the stats.
    mocks.getScrapeJobById.mockResolvedValueOnce({
      id: 'job-stuck',
      kolSourceId: 'source-1',
      status: 'completed',
      jobType: 'initial_scrape',
      discoveredUrls: ['u1', 'u2', 'u3'],
      totalUrls: 3,
      processedUrls: 3,
      importedCount: 2,
      duplicateCount: 0,
      errorCount: 1,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-existing' }));

    const result = await processJobBatch('job-stuck', 10, 50_000);

    expect(mocks.reconcileStuckJob).toHaveBeenCalledWith('job-stuck');
    expect(mocks.processUrl).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
    expect(result).toEqual({
      processedUrls: 3,
      totalUrls: 3,
      importedCount: 2,
      duplicateCount: 0,
      errorCount: 1,
      filteredCount: 0,
      status: 'completed',
    });
  });

  it('continues normal processing when reconciler reports nothing to reconcile', async () => {
    mocks.reconcileStuckJob.mockResolvedValueOnce({ reconciled: false });
    mocks.getScrapeJobById.mockResolvedValueOnce({
      id: 'job-fresh',
      kolSourceId: 'source-1',
      status: 'queued',
      jobType: 'initial_scrape',
      discoveredUrls: ['u1'],
      totalUrls: 1,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-existing' }));

    await processJobBatch('job-fresh', 10, 50_000);

    expect(mocks.reconcileStuckJob).toHaveBeenCalledWith('job-fresh');
    expect(mocks.processUrl).toHaveBeenCalledTimes(1);
    expect(mocks.completeScrapeJob).toHaveBeenCalled();
  });

  it('logs and continues when the reconciler itself throws (non-blocking)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.reconcileStuckJob.mockRejectedValueOnce(new Error('reconciler boom'));
    mocks.getScrapeJobById.mockResolvedValueOnce({
      id: 'job-fresh',
      kolSourceId: 'source-1',
      status: 'queued',
      jobType: 'initial_scrape',
      discoveredUrls: ['u1'],
      totalUrls: 1,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-existing' }));

    await processJobBatch('job-fresh', 10, 50_000);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('reconcileStuckJob threw'),
      expect.any(Error)
    );
    expect(mocks.processUrl).toHaveBeenCalledTimes(1); // pipeline still ran
    consoleSpy.mockRestore();
  });
});

// ── Synchronous scorecard recompute on scrape completion (R11) ──

describe('processJobBatch awaits computeKolScorecard after completeScrapeJob (R11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reconcileStuckJob.mockResolvedValue({ reconciled: false });
    mocks.getUserTimezone.mockResolvedValue('UTC');
    mocks.checkFirstImportFree.mockResolvedValue(false);
    mocks.processUrl.mockResolvedValue({ status: 'success' });
    mocks.startScrapeJob.mockResolvedValue(undefined);
    mocks.updateScrapeJobProgress.mockResolvedValue(undefined);
    mocks.completeScrapeJob.mockResolvedValue(undefined);
    mocks.updateScrapeStatus.mockResolvedValue(undefined);
    mocks.computeKolScorecard.mockResolvedValue(undefined);
  });

  it('awaits computeKolScorecard after a successful scrape completes', async () => {
    mocks.getScrapeJobById.mockResolvedValue({
      id: 'job-finish',
      kolSourceId: 'source-1',
      status: 'queued',
      jobType: 'initial_scrape',
      discoveredUrls: ['u1'],
      totalUrls: 1,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-existing' }));

    const callOrder: string[] = [];
    mocks.completeScrapeJob.mockImplementationOnce(async () => {
      callOrder.push('completeScrapeJob');
    });
    mocks.computeKolScorecard.mockImplementationOnce(async () => {
      callOrder.push('computeKolScorecard');
    });

    await processJobBatch('job-finish', 10, 50_000);

    expect(mocks.completeScrapeJob).toHaveBeenCalled();
    expect(mocks.computeKolScorecard).toHaveBeenCalledWith('kol-existing');
    // Order matters — recompute runs after the job is flipped completed.
    expect(callOrder).toEqual(['completeScrapeJob', 'computeKolScorecard']);
  });

  it('logs and continues when computeKolScorecard throws (does not propagate)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getScrapeJobById.mockResolvedValue({
      id: 'job-finish-fail',
      kolSourceId: 'source-1',
      status: 'queued',
      jobType: 'initial_scrape',
      discoveredUrls: ['u1'],
      totalUrls: 1,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    mocks.getSourceById.mockResolvedValue(mockSource({ kolId: 'kol-existing' }));
    mocks.computeKolScorecard.mockRejectedValueOnce(new Error('tiingo down'));

    const result = await processJobBatch('job-finish-fail', 10, 50_000);

    // The throw is swallowed — scrape status stays completed.
    expect(result.status).toBe('completed');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('computeKolScorecard'),
      expect.any(String)
    );
    consoleSpy.mockRestore();
  });

  it('skips computeKolScorecard for batch-import jobs with no kolId', async () => {
    mocks.getScrapeJobById.mockResolvedValue({
      id: 'job-batch',
      kolSourceId: null, // batch-import: no backing source
      status: 'queued',
      jobType: 'batch_import',
      discoveredUrls: ['u1'],
      totalUrls: 1,
      processedUrls: 0,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      filteredCount: 0,
      triggeredBy: USER_ID,
      retryCount: 0,
    });
    // No source resolution.
    mocks.getSourceById.mockResolvedValue(null);

    await processJobBatch('job-batch', 10, 50_000);

    expect(mocks.completeScrapeJob).toHaveBeenCalled();
    expect(mocks.computeKolScorecard).not.toHaveBeenCalled();
  });
});

// ── Apify discovery up-front charge ──

describe('discoverProfileUrls — Apify discovery charging', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    aiUsageMocks.consumeCredits.mockResolvedValue({
      balance: 100,
      weeklyLimit: 700,
      resetAt: null,
    });
    mocks.youtubeChannelExtractor.isValidProfileUrl.mockReturnValue(false);
    mocks.twitterProfileExtractor.isValidProfileUrl.mockReturnValue(false);
    mocks.podcastProfileExtractor.isValidProfileUrl.mockReturnValue(false);
    const { facebookProfileExtractor, tiktokProfileExtractor } =
      await import('@/infrastructure/extractors');
    vi.mocked(facebookProfileExtractor.isValidProfileUrl).mockReturnValue(false);
    vi.mocked(tiktokProfileExtractor.isValidProfileUrl).mockReturnValue(false);
  });

  it('charges scrape.apify.profile (3 credits) up-front for Facebook discovery', async () => {
    // Patch the facebookProfileExtractor mock from the extractors module mock above.
    const { facebookProfileExtractor } = await import('@/infrastructure/extractors');
    vi.mocked(facebookProfileExtractor.isValidProfileUrl).mockReturnValue(true);
    vi.mocked(facebookProfileExtractor.extractProfile).mockResolvedValue({
      kolName: 'TraderJoe',
      kolAvatarUrl: null,
      platformId: 'fb-123',
      platformUrl: 'https://facebook.com/traderjoe',
      postUrls: ['https://facebook.com/traderjoe/posts/1'],
      discoveredUrls: [{ url: 'https://facebook.com/traderjoe/posts/1' }],
    });

    const result = await discoverProfileUrls('https://facebook.com/traderjoe', USER_ID);

    // composeCost([{ scrape.apify.profile, 1 }]) = 2.0 -> 2
    expect(aiUsageMocks.consumeCredits).toHaveBeenCalledWith(USER_ID, 2, 'apify_profile_discovery');
    // Per-item recipe attached: scrape.apify.post(0.5) + ai.analyze.short(1.0) = 1.5 -> 2
    expect(result.discoveredUrls[0].estimatedCreditCost).toBe(2);
    expect(result.discoveredUrls[0].recipe).toEqual([
      { block: 'scrape.apify.post', units: 1 },
      { block: 'ai.analyze.short', units: 1 },
    ]);
  });

  it('does NOT charge Apify discovery for podcast (RSS) profile', async () => {
    mocks.podcastProfileExtractor.isValidProfileUrl.mockReturnValue(true);
    mocks.podcastProfileExtractor.extractProfile.mockResolvedValue({
      kolName: 'PodcastShow',
      kolAvatarUrl: null,
      platformId: 'rss',
      platformUrl: 'https://feeds.example.com/show.xml',
      postUrls: [],
      discoveredUrls: [],
    });

    await discoverProfileUrls('https://feeds.example.com/show.xml', USER_ID);

    expect(aiUsageMocks.consumeCredits).not.toHaveBeenCalled();
  });

  it('does NOT charge when no userId is provided (anonymous discovery)', async () => {
    const { facebookProfileExtractor } = await import('@/infrastructure/extractors');
    vi.mocked(facebookProfileExtractor.isValidProfileUrl).mockReturnValue(true);
    vi.mocked(facebookProfileExtractor.extractProfile).mockResolvedValue({
      kolName: 'TraderJoe',
      kolAvatarUrl: null,
      platformId: 'fb-123',
      platformUrl: 'https://facebook.com/traderjoe',
      postUrls: [],
      discoveredUrls: [],
    });

    await discoverProfileUrls('https://facebook.com/traderjoe');

    expect(aiUsageMocks.consumeCredits).not.toHaveBeenCalled();
  });
});
