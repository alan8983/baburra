import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mocks ──

const mocks = vi.hoisted(() => ({
  // Repositories
  findKolByName: vi.fn(),
  createKol: vi.fn(),
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
  // Import pipeline
  processUrl: vi.fn(),
}));

vi.mock('@/infrastructure/repositories', () => ({
  findKolByName: mocks.findKolByName,
  createKol: mocks.createKol,
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
}));

vi.mock('@/infrastructure/repositories/profile.repository', () => ({
  getUserTimezone: mocks.getUserTimezone,
}));

vi.mock('@/infrastructure/extractors', () => ({
  youtubeChannelExtractor: mocks.youtubeChannelExtractor,
  twitterProfileExtractor: mocks.twitterProfileExtractor,
}));

vi.mock('@/domain/services/import-pipeline.service', () => ({
  processUrl: mocks.processUrl,
}));

import { initiateProfileScrape, checkForNewContent } from '../profile-scrape.service';

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
    mocks.createKol.mockResolvedValue({ id: 'kol-new', name: 'TraderJoe' });
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
    expect(mocks.createKol).toHaveBeenCalledWith({
      name: 'TraderJoe',
      avatarUrl: 'https://img.example.com/avatar.jpg',
    });
  });

  it('reuses existing KOL and does not call createKol', async () => {
    mocks.findKolByName.mockResolvedValue({ id: 'kol-existing', name: 'TraderJoe' });

    const result = await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.createKol).not.toHaveBeenCalled();
    expect(result.kolId).toBe('kol-existing');
  });

  it('calls findOrCreateSource with correct args', async () => {
    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.findOrCreateSource).toHaveBeenCalledWith(
      'kol-new',
      'youtube',
      'UC123',
      'https://youtube.com/@traderjoe'
    );
  });

  it('updates scrape status to scraping', async () => {
    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.updateScrapeStatus).toHaveBeenCalledWith('source-1', 'scraping');
  });

  it('creates scrape job with correct args', async () => {
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

  it('handles null kolAvatarUrl by passing undefined to createKol', async () => {
    mocks.youtubeChannelExtractor.extractProfile.mockResolvedValue(
      mockProfile({ kolAvatarUrl: null })
    );

    await initiateProfileScrape('https://youtube.com/@traderjoe', USER_ID);

    expect(mocks.createKol).toHaveBeenCalledWith({
      name: 'TraderJoe',
      avatarUrl: undefined,
    });
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
