import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mocks ──

const mocks = vi.hoisted(() => ({
  extractFromUrl: vi.fn(),
  findKolByName: vi.fn(),
  createKol: vi.fn(),
  findPostBySourceUrl: vi.fn(),
  createPost: vi.fn(),
  getStockByTicker: vi.fn(),
  createStock: vi.fn(),
  findPrimaryPostByFingerprint: vi.fn(),
  createMirrorPost: vi.fn(),
  consumeCredits: vi.fn(),
  refundCredits: vi.fn(),
  checkFirstImportFree: vi.fn(),
  markFirstImportUsed: vi.fn(),
  getUserTimezone: vi.fn(),
  analyzeDraftContent: vi.fn(),
  extractArguments: vi.fn(),
  extractAtHandles: vi.fn(),
  findTranscriptByUrl: vi.fn(),
  saveTranscript: vi.fn(),
  getAiModelVersion: vi.fn(),
  downloadYoutubeAudio: vi.fn(),
  deepgramTranscribe: vi.fn(),
}));

vi.mock('@/infrastructure/extractors', () => ({
  extractorFactory: { extractFromUrl: mocks.extractFromUrl },
}));

vi.mock('@/infrastructure/repositories', () => ({
  findKolByName: mocks.findKolByName,
  createKol: mocks.createKol,
  findPostBySourceUrl: mocks.findPostBySourceUrl,
  createPost: mocks.createPost,
  getStockByTicker: mocks.getStockByTicker,
  createStock: mocks.createStock,
  findPrimaryPostByFingerprint: mocks.findPrimaryPostByFingerprint,
  createMirrorPost: mocks.createMirrorPost,
}));

vi.mock('@/infrastructure/repositories/ai-usage.repository', () => ({
  consumeCredits: mocks.consumeCredits,
  refundCredits: mocks.refundCredits,
}));

vi.mock('@/infrastructure/repositories/transcript.repository', () => ({
  findTranscriptByUrl: mocks.findTranscriptByUrl,
  saveTranscript: mocks.saveTranscript,
}));

vi.mock('@/infrastructure/repositories/profile.repository', () => ({
  checkFirstImportFree: mocks.checkFirstImportFree,
  markFirstImportUsed: mocks.markFirstImportUsed,
  getUserTimezone: mocks.getUserTimezone,
}));

vi.mock('@/domain/services/ai.service', () => ({
  analyzeDraftContent: mocks.analyzeDraftContent,
  extractArguments: mocks.extractArguments,
  extractAtHandles: mocks.extractAtHandles,
}));

vi.mock('@/infrastructure/api/gemini.client', () => ({
  getAiModelVersion: mocks.getAiModelVersion,
}));

vi.mock('@/infrastructure/api/youtube-audio.client', () => ({
  downloadYoutubeAudio: mocks.downloadYoutubeAudio,
}));

vi.mock('@/infrastructure/api/deepgram.client', () => ({
  deepgramTranscribe: mocks.deepgramTranscribe,
}));

import { executeBatchImport } from '../import-pipeline.service';

// ── Helpers ──

const USER_ID = 'user-123';

function mockFetchResult(overrides = {}) {
  return {
    content: 'AAPL looks bullish, buy now!',
    sourceUrl: 'https://x.com/trader/status/123',
    sourcePlatform: 'twitter',
    title: 'Bullish on AAPL',
    images: [],
    kolName: 'TraderJoe',
    postedAt: '2025-06-01T10:00:00Z',
    ...overrides,
  };
}

function mockAnalysis(overrides = {}) {
  return {
    kolName: null,
    stockTickers: [{ ticker: 'AAPL', name: 'Apple Inc.', market: 'US', confidence: 0.9 }],
    sentiment: 1,
    confidence: 0.85,
    reasoning: 'Bullish signal',
    postedAt: '2025-06-01T10:00:00Z',
    stockSentiments: { AAPL: 1 },
    ...overrides,
  };
}

/** Set up all mocks for a single successful URL import */
function setupSuccessfulImport() {
  mocks.getUserTimezone.mockResolvedValue('Asia/Taipei');
  mocks.checkFirstImportFree.mockResolvedValue(false); // not first import (free already used)
  mocks.consumeCredits.mockResolvedValue({
    balance: 699,
    weeklyLimit: 700,
    resetAt: null,
    subscriptionTier: 'free',
  });
  mocks.refundCredits.mockResolvedValue(undefined);
  mocks.findPostBySourceUrl.mockResolvedValue(null); // no duplicate
  mocks.extractFromUrl.mockResolvedValue(mockFetchResult());
  mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis());
  mocks.extractAtHandles.mockReturnValue([]);
  mocks.findKolByName.mockResolvedValue({ id: 'kol-1', name: 'TraderJoe' });
  mocks.getStockByTicker.mockResolvedValue({ id: 'stock-1', ticker: 'AAPL' });
  mocks.extractArguments.mockResolvedValue({ arguments: [] });
  mocks.createPost.mockResolvedValue({ id: 'post-1' });
  mocks.getAiModelVersion.mockReturnValue('gemini-2.0-flash');
  mocks.findTranscriptByUrl.mockResolvedValue(null);
  mocks.saveTranscript.mockResolvedValue(undefined);
  mocks.findPrimaryPostByFingerprint.mockResolvedValue(null); // no content duplicate
  mocks.createMirrorPost.mockResolvedValue({ id: 'mirror-1' });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

// =====================
// executeBatchImport
// =====================

describe('executeBatchImport', () => {
  // ── Happy path ──

  it('processes a single URL successfully', async () => {
    setupSuccessfulImport();

    const result = await executeBatchImport({ urls: ['https://x.com/trader/status/123'] }, USER_ID);

    expect(result.totalImported).toBe(1);
    expect(result.totalDuplicate).toBe(0);
    expect(result.totalError).toBe(0);
    expect(result.urlResults).toHaveLength(1);
    expect(result.urlResults[0].status).toBe('success');
    expect(result.urlResults[0].postId).toBe('post-1');
    expect(result.urlResults[0].kolName).toBe('TraderJoe');
    expect(result.urlResults[0].stockTickers).toEqual(['AAPL']);
    expect(result.kols).toHaveLength(1);
    expect(result.kols[0].kolId).toBe('kol-1');
    expect(result.kols[0].postCount).toBe(1);
  });

  it('processes multiple URLs and aggregates KOL summary', async () => {
    setupSuccessfulImport();
    // Second URL uses same KOL
    mocks.findPostBySourceUrl.mockResolvedValue(null);

    const result = await executeBatchImport(
      { urls: ['https://x.com/trader/status/1', 'https://x.com/trader/status/2'] },
      USER_ID
    );

    expect(result.totalImported).toBe(2);
    expect(result.kols).toHaveLength(1);
    expect(result.kols[0].postCount).toBe(2);
  });

  // ── Duplicate detection ──

  it('marks duplicate URLs correctly', async () => {
    setupSuccessfulImport();
    mocks.findPostBySourceUrl.mockResolvedValue({ id: 'existing-post' });

    const result = await executeBatchImport({ urls: ['https://x.com/dup/status/1'] }, USER_ID);

    expect(result.totalDuplicate).toBe(1);
    expect(result.totalImported).toBe(0);
    expect(result.urlResults[0].status).toBe('duplicate');
    expect(result.urlResults[0].postId).toBe('existing-post');
    // Should not consume credits for duplicates
    expect(mocks.consumeCredits).not.toHaveBeenCalled();
  });

  // ── Quota management ──

  it('consumes credits for non-exempt users', async () => {
    setupSuccessfulImport();

    await executeBatchImport({ urls: ['https://x.com/trader/status/1'] }, USER_ID);

    // text_analysis recipe = scrape.html(0.2) + ai.analyze.short(1.0) = 1.2 -> 2
    expect(mocks.consumeCredits).toHaveBeenCalledWith(USER_ID, 2, 'text_analysis');
  });

  it('skips credit consumption for first-import-free users', async () => {
    setupSuccessfulImport();
    mocks.checkFirstImportFree.mockResolvedValue(true); // first import is free

    await executeBatchImport({ urls: ['https://x.com/trader/status/1'] }, USER_ID);

    expect(mocks.consumeCredits).not.toHaveBeenCalled();
  });

  it('marks first import used after first successful import', async () => {
    setupSuccessfulImport();
    mocks.checkFirstImportFree.mockResolvedValue(true); // first import is free

    const result = await executeBatchImport({ urls: ['https://x.com/trader/status/1'] }, USER_ID);

    expect(mocks.markFirstImportUsed).toHaveBeenCalledWith(USER_ID);
    expect(result.firstImportFreeUsed).toBe(true);
  });

  it('does not mark first import used when all URLs fail', async () => {
    setupSuccessfulImport();
    mocks.checkFirstImportFree.mockResolvedValue(true); // first import is free
    mocks.extractFromUrl.mockRejectedValue(new Error('Network error'));

    const result = await executeBatchImport({ urls: ['https://x.com/fail/status/1'] }, USER_ID);

    expect(mocks.markFirstImportUsed).not.toHaveBeenCalled();
    expect(result.firstImportFreeUsed).toBe(false);
  });

  it('returns error for all URLs when credits are insufficient', async () => {
    setupSuccessfulImport();
    mocks.consumeCredits.mockRejectedValue(
      Object.assign(new Error('Insufficient credits'), { code: 'INSUFFICIENT_CREDITS' })
    );

    const result = await executeBatchImport(
      { urls: ['https://x.com/a/status/1', 'https://x.com/b/status/2'] },
      USER_ID
    );

    // With parallel processing, both URLs independently hit insufficient credits
    expect(result.urlResults[0].status).toBe('error');
    expect(result.urlResults[0].error).toContain('Insufficient credits');
    expect(result.urlResults[1].status).toBe('error');
    expect(result.urlResults[1].error).toContain('Insufficient credits');
    expect(result.totalError).toBe(2);
  });

  it('refunds credits when pipeline fails after consumption', async () => {
    setupSuccessfulImport();
    // Fail AFTER credit consumption — analyzeDraftContent throws
    mocks.analyzeDraftContent.mockRejectedValue(new Error('AI analysis failed'));

    await executeBatchImport({ urls: ['https://x.com/fail/status/1'] }, USER_ID);

    // 2 credits consumed for text_analysis recipe, then refunded
    expect(mocks.refundCredits).toHaveBeenCalledWith(USER_ID, 2);
  });

  it('refunds credits when zero tickers are identified', async () => {
    setupSuccessfulImport();
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ stockTickers: [] }));

    const result = await executeBatchImport({ urls: ['https://x.com/noticker/status/1'] }, USER_ID);

    expect(result.urlResults[0].status).toBe('error');
    expect(result.urlResults[0].error).toBe('no_tickers_identified');
    expect(mocks.refundCredits).toHaveBeenCalledWith(USER_ID, 2);
  });

  it('does not refund credits for first-import-free users on zero tickers', async () => {
    setupSuccessfulImport();
    mocks.checkFirstImportFree.mockResolvedValue(true); // first import is free (exempt)
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ stockTickers: [] }));

    await executeBatchImport({ urls: ['https://x.com/noticker/status/1'] }, USER_ID);

    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  // ── KOL auto-detection ──

  it('uses extractor kolName first', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ kolName: 'FromExtractor' }));
    mocks.findKolByName.mockResolvedValue({ id: 'kol-ext', name: 'FromExtractor' });

    const result = await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(result.urlResults[0].kolName).toBe('FromExtractor');
  });

  it('falls back to AI kolName when extractor has none', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ kolName: null }));
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ kolName: 'AIDetected' }));
    mocks.findKolByName.mockResolvedValue({ id: 'kol-ai', name: 'AIDetected' });

    const result = await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(result.urlResults[0].kolName).toBe('AIDetected');
  });

  it('falls back to @handle when extractor and AI have no kolName', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ kolName: null }));
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ kolName: null }));
    mocks.extractAtHandles.mockReturnValue(['@handleUser']);
    mocks.findKolByName.mockResolvedValue({ id: 'kol-handle', name: '@handleUser' });

    const result = await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(result.urlResults[0].kolName).toBe('@handleUser');
  });

  it('falls back to "Unknown" when no KOL name is detected', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ kolName: null }));
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ kolName: null }));
    mocks.extractAtHandles.mockReturnValue([]);
    mocks.findKolByName.mockResolvedValue(null);
    mocks.createKol.mockResolvedValue({ id: 'kol-unknown' });

    const result = await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(result.urlResults[0].kolName).toBe('Unknown');
  });

  // ── KOL creation ──

  it('uses existing KOL when found by name', async () => {
    setupSuccessfulImport();

    await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(mocks.findKolByName).toHaveBeenCalledWith('TraderJoe');
    expect(mocks.createKol).not.toHaveBeenCalled();
  });

  it('creates new KOL when not found by name', async () => {
    setupSuccessfulImport();
    mocks.findKolByName.mockResolvedValue(null);
    mocks.createKol.mockResolvedValue({ id: 'new-kol' });

    const result = await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(mocks.createKol).toHaveBeenCalledWith({ name: 'TraderJoe' });
    expect(result.urlResults[0].kolCreated).toBe(true);
    expect(result.kols[0].kolCreated).toBe(true);
  });

  it('resolves same KOL for URLs with same KOL name (parallel processing)', async () => {
    setupSuccessfulImport();

    const result = await executeBatchImport(
      { urls: ['https://x.com/a/status/1', 'https://x.com/a/status/2'] },
      USER_ID
    );

    // With parallel processing, both URLs may look up KOL concurrently
    // but should still resolve to the same KOL in the final results
    expect(mocks.findKolByName).toHaveBeenCalledWith('TraderJoe');
    expect(result.kols).toHaveLength(1);
    expect(result.kols[0].postCount).toBe(2);
  });

  // ── Stock handling ──

  it('uses existing stock when found by ticker', async () => {
    setupSuccessfulImport();

    await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(mocks.getStockByTicker).toHaveBeenCalledWith('AAPL');
    expect(mocks.createStock).not.toHaveBeenCalled();
  });

  it('creates new stock when not found by ticker', async () => {
    setupSuccessfulImport();
    mocks.getStockByTicker.mockResolvedValue(null);
    mocks.createStock.mockResolvedValue({ id: 'new-stock' });

    await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(mocks.createStock).toHaveBeenCalledWith({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      market: 'US',
    });
  });

  it('handles multiple tickers in one URL', async () => {
    setupSuccessfulImport();
    mocks.analyzeDraftContent.mockResolvedValue(
      mockAnalysis({
        stockTickers: [
          { ticker: 'AAPL', name: 'Apple Inc.', market: 'US', confidence: 0.9 },
          { ticker: 'TSLA', name: 'Tesla Inc.', market: 'US', confidence: 0.8 },
        ],
        stockSentiments: { AAPL: 1, TSLA: -1 },
      })
    );
    mocks.getStockByTicker
      .mockResolvedValueOnce({ id: 'stock-aapl', ticker: 'AAPL' })
      .mockResolvedValueOnce({ id: 'stock-tsla', ticker: 'TSLA' });

    const result = await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(result.urlResults[0].stockTickers).toEqual(['AAPL', 'TSLA']);
    expect(mocks.getStockByTicker).toHaveBeenCalledTimes(2);
  });

  // ── Argument extraction ──

  it('extracts arguments for identified tickers', async () => {
    setupSuccessfulImport();
    mocks.extractArguments.mockResolvedValue({
      arguments: [{ category: 'technical', content: 'Moving average crossover', type: 'bullish' }],
    });

    await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(mocks.extractArguments).toHaveBeenCalledWith(
      expect.any(String),
      'AAPL',
      'Apple Inc.',
      expect.objectContaining({ retries: expect.any(Number) })
    );
    // createPost should receive the arguments
    expect(mocks.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        draftAiArguments: expect.arrayContaining([expect.objectContaining({ ticker: 'AAPL' })]),
      }),
      USER_ID
    );
  });

  it('continues without arguments when extraction fails', async () => {
    setupSuccessfulImport();
    mocks.extractArguments.mockRejectedValue(new Error('AI timeout'));

    const result = await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    // Should still succeed, arguments are optional
    expect(result.urlResults[0].status).toBe('success');
  });

  // ── Error handling ──

  it('catches per-URL errors and continues processing', async () => {
    setupSuccessfulImport();
    // First URL fails, second succeeds
    mocks.findPostBySourceUrl.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.extractFromUrl
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce(mockFetchResult());

    const result = await executeBatchImport(
      { urls: ['https://x.com/fail/status/1', 'https://x.com/ok/status/2'] },
      USER_ID
    );

    expect(result.totalError).toBe(1);
    expect(result.totalImported).toBe(1);
    expect(result.urlResults[0].status).toBe('error');
    expect(result.urlResults[0].error).toBe('Network timeout');
    expect(result.urlResults[1].status).toBe('success');
  });

  it('handles non-Error thrown values', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockRejectedValue('string error');

    const result = await executeBatchImport({ urls: ['https://x.com/a/status/1'] }, USER_ID);

    expect(result.urlResults[0].status).toBe('error');
    expect(result.urlResults[0].error).toBe('Unknown error');
  });

  // ── Post creation ──

  it('creates post with correct parameters', async () => {
    setupSuccessfulImport();

    await executeBatchImport({ urls: ['https://x.com/trader/status/123'] }, USER_ID);

    expect(mocks.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        kolId: 'kol-1',
        stockIds: ['stock-1'],
        content: 'AAPL looks bullish, buy now!',
        sourceUrl: 'https://x.com/trader/status/123',
        sourcePlatform: 'twitter',
        title: 'Bullish on AAPL',
        sentiment: 1,
        sentimentAiGenerated: true,
      }),
      USER_ID
    );
  });

  // ── Aggregation ──

  it('correctly tallies imported, duplicate, and error counts', async () => {
    mocks.getUserTimezone.mockResolvedValue('Asia/Taipei');
    mocks.checkFirstImportFree.mockResolvedValue(false); // not first import
    mocks.consumeCredits.mockResolvedValue({
      balance: 699,
      weeklyLimit: 700,
      resetAt: null,
      subscriptionTier: 'free',
    });
    mocks.extractAtHandles.mockReturnValue([]);
    mocks.getAiModelVersion.mockReturnValue('gemini-2.0-flash');

    // URL 1: success
    mocks.findPostBySourceUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'dup-1' }) // URL 2: duplicate
      .mockResolvedValueOnce(null); // URL 3: will error
    mocks.extractFromUrl
      .mockResolvedValueOnce(mockFetchResult())
      .mockRejectedValueOnce(new Error('fail'));
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis());
    mocks.findKolByName.mockResolvedValue({ id: 'kol-1', name: 'TraderJoe' });
    mocks.getStockByTicker.mockResolvedValue({ id: 'stock-1', ticker: 'AAPL' });
    mocks.extractArguments.mockResolvedValue({ arguments: [] });
    mocks.createPost.mockResolvedValue({ id: 'post-1' });

    const result = await executeBatchImport(
      { urls: ['https://x.com/a/1', 'https://x.com/b/2', 'https://x.com/c/3'] },
      USER_ID
    );

    expect(result.totalImported).toBe(1);
    expect(result.totalDuplicate).toBe(1);
    expect(result.totalError).toBe(1);
  });

  // ── postedAt priority ──

  it('prefers extractor postedAt over AI analysis postedAt', async () => {
    setupSuccessfulImport();
    const extractorDate = '2025-07-28T00:00:00Z';
    const aiDate = '2026-03-30T00:00:00Z';
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ postedAt: extractorDate }));
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ postedAt: aiDate }));

    await executeBatchImport({ urls: ['https://x.com/trader/status/1'] }, USER_ID);

    const createPostCall = mocks.createPost.mock.calls[0][0];
    expect(createPostCall.postedAt).toEqual(new Date(extractorDate));
  });

  it('falls back to AI postedAt when extractor postedAt is null', async () => {
    setupSuccessfulImport();
    const aiDate = '2025-06-15T10:00:00Z';
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ postedAt: null }));
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ postedAt: aiDate }));

    await executeBatchImport({ urls: ['https://x.com/trader/status/1'] }, USER_ID);

    const createPostCall = mocks.createPost.mock.calls[0][0];
    expect(createPostCall.postedAt).toEqual(new Date(aiDate));
  });

  // ── Content fingerprint dedup (Gate C) ─��

  const LONG_CONTENT = Array(100)
    .fill('TSMC revenue grew by twenty three percent year over year')
    .join(' ');

  it('creates a mirror and skips AI when fingerprint matches an existing primary', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ content: LONG_CONTENT }));
    // Gate C hit: fingerprint matches an existing primary post
    mocks.findPrimaryPostByFingerprint.mockResolvedValue({
      id: 'primary-1',
      kolId: 'kol-1',
    });
    mocks.createMirrorPost.mockResolvedValue({ id: 'mirror-1' });

    const result = await executeBatchImport({ urls: ['https://x.com/mirror/status/1'] }, USER_ID);

    expect(result.urlResults[0].status).toBe('mirror_linked');
    expect(result.urlResults[0].postId).toBe('mirror-1');
    expect(result.urlResults[0].primaryPostId).toBe('primary-1');
    // AI analysis should NOT have been called
    expect(mocks.analyzeDraftContent).not.toHaveBeenCalled();
    expect(mocks.extractArguments).not.toHaveBeenCalled();
    // createPost (primary path) should NOT have been called
    expect(mocks.createPost).not.toHaveBeenCalled();
    // createMirrorPost SHOULD have been called
    expect(mocks.createMirrorPost).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryPostId: 'primary-1',
        kolId: 'kol-1',
      })
    );
  });

  it('counts mirror_linked as duplicate in batch totals', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ content: LONG_CONTENT }));
    mocks.findPrimaryPostByFingerprint.mockResolvedValue({
      id: 'primary-1',
      kolId: 'kol-1',
    });

    const result = await executeBatchImport({ urls: ['https://x.com/mirror/status/1'] }, USER_ID);

    expect(result.totalDuplicate).toBe(1);
    expect(result.totalImported).toBe(0);
  });

  it('falls through to normal pipeline when fingerprint does not match', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ content: LONG_CONTENT }));
    // Fingerprint computed but no match in DB
    mocks.findPrimaryPostByFingerprint.mockResolvedValue(null);

    const result = await executeBatchImport({ urls: ['https://x.com/new/status/1'] }, USER_ID);

    expect(result.urlResults[0].status).toBe('success');
    expect(mocks.analyzeDraftContent).toHaveBeenCalled();
    expect(mocks.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ contentFingerprint: expect.any(String) }),
      USER_ID
    );
  });

  it('skips fingerprint gate when content is too short (below token threshold)', async () => {
    setupSuccessfulImport();
    // Short content — computeContentFingerprint returns null
    mocks.extractFromUrl.mockResolvedValue(mockFetchResult({ content: 'buy AAPL' }));

    const result = await executeBatchImport({ urls: ['https://x.com/short/status/1'] }, USER_ID);

    // Should proceed through normal pipeline
    expect(result.urlResults[0].status).toBe('success');
    expect(mocks.findPrimaryPostByFingerprint).not.toHaveBeenCalled();
    expect(mocks.analyzeDraftContent).toHaveBeenCalled();
  });

  it('skips fingerprint gate when KOL cannot be resolved early', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockResolvedValue(
      mockFetchResult({ content: LONG_CONTENT, kolName: null })
    );
    // No KOL name from extractor, so early KOL resolution fails
    mocks.findKolByName.mockResolvedValue(null);
    mocks.createKol.mockResolvedValue({ id: 'kol-new' });

    const result = await executeBatchImport({ urls: ['https://x.com/noname/status/1'] }, USER_ID);

    // Should proceed through normal pipeline (KOL resolved after AI analysis)
    expect(result.urlResults[0].status).toBe('success');
    expect(mocks.analyzeDraftContent).toHaveBeenCalled();
  });
});
