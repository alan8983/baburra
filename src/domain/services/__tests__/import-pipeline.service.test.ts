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
  consumeAiQuota: vi.fn(),
  refundAiQuota: vi.fn(),
  checkOnboardingImportUsed: vi.fn(),
  markOnboardingImportUsed: vi.fn(),
  getUserTimezone: vi.fn(),
  analyzeDraftContent: vi.fn(),
  extractArguments: vi.fn(),
  extractAtHandles: vi.fn(),
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
  consumeAiQuota: mocks.consumeAiQuota,
}));

vi.mock('@/infrastructure/repositories/ai-usage.repository', () => ({
  refundAiQuota: mocks.refundAiQuota,
}));

vi.mock('@/infrastructure/repositories/profile.repository', () => ({
  checkOnboardingImportUsed: mocks.checkOnboardingImportUsed,
  markOnboardingImportUsed: mocks.markOnboardingImportUsed,
  getUserTimezone: mocks.getUserTimezone,
}));

vi.mock('@/domain/services/ai.service', () => ({
  analyzeDraftContent: mocks.analyzeDraftContent,
  extractArguments: mocks.extractArguments,
  extractAtHandles: mocks.extractAtHandles,
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
  mocks.checkOnboardingImportUsed.mockResolvedValue(true); // not first import
  mocks.consumeAiQuota.mockResolvedValue(undefined);
  mocks.refundAiQuota.mockResolvedValue(undefined);
  mocks.findPostBySourceUrl.mockResolvedValue(null); // no duplicate
  mocks.extractFromUrl.mockResolvedValue(mockFetchResult());
  mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis());
  mocks.extractAtHandles.mockReturnValue([]);
  mocks.findKolByName.mockResolvedValue({ id: 'kol-1', name: 'TraderJoe' });
  mocks.getStockByTicker.mockResolvedValue({ id: 'stock-1', ticker: 'AAPL' });
  mocks.extractArguments.mockResolvedValue({ arguments: [] });
  mocks.createPost.mockResolvedValue({ id: 'post-1' });
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
    // Should not consume quota for duplicates
    expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
  });

  // ── Quota management ──

  it('consumes AI quota for non-exempt users', async () => {
    setupSuccessfulImport();

    await executeBatchImport({ urls: ['https://x.com/trader/status/1'] }, USER_ID);

    expect(mocks.consumeAiQuota).toHaveBeenCalledWith(USER_ID);
  });

  it('skips quota consumption for onboarding-exempt users (first import)', async () => {
    setupSuccessfulImport();
    mocks.checkOnboardingImportUsed.mockResolvedValue(false); // first import

    await executeBatchImport({ urls: ['https://x.com/trader/status/1'] }, USER_ID);

    expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
  });

  it('marks onboarding import used after first successful import', async () => {
    setupSuccessfulImport();
    mocks.checkOnboardingImportUsed.mockResolvedValue(false);

    const result = await executeBatchImport({ urls: ['https://x.com/trader/status/1'] }, USER_ID);

    expect(mocks.markOnboardingImportUsed).toHaveBeenCalledWith(USER_ID);
    expect(result.onboardingQuotaUsed).toBe(true);
  });

  it('does not mark onboarding used when all URLs fail', async () => {
    setupSuccessfulImport();
    mocks.checkOnboardingImportUsed.mockResolvedValue(false);
    mocks.extractFromUrl.mockRejectedValue(new Error('Network error'));

    const result = await executeBatchImport({ urls: ['https://x.com/fail/status/1'] }, USER_ID);

    expect(mocks.markOnboardingImportUsed).not.toHaveBeenCalled();
    expect(result.onboardingQuotaUsed).toBe(false);
  });

  it('returns quota exceeded error for all URLs when quota is exhausted', async () => {
    setupSuccessfulImport();
    mocks.consumeAiQuota.mockRejectedValue({ code: 'AI_QUOTA_EXCEEDED' });

    const result = await executeBatchImport(
      { urls: ['https://x.com/a/status/1', 'https://x.com/b/status/2'] },
      USER_ID
    );

    // With parallel processing, both URLs independently hit quota exceeded
    expect(result.urlResults[0].status).toBe('error');
    expect(result.urlResults[0].error).toContain('quota');
    expect(result.urlResults[1].status).toBe('error');
    expect(result.urlResults[1].error).toContain('quota');
    expect(result.totalError).toBe(2);
  });

  it('refunds quota when pipeline fails after consumption', async () => {
    setupSuccessfulImport();
    mocks.extractFromUrl.mockRejectedValue(new Error('Extraction failed'));

    await executeBatchImport({ urls: ['https://x.com/fail/status/1'] }, USER_ID);

    expect(mocks.refundAiQuota).toHaveBeenCalledWith(USER_ID);
  });

  it('refunds quota when zero tickers are identified', async () => {
    setupSuccessfulImport();
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ stockTickers: [] }));

    const result = await executeBatchImport({ urls: ['https://x.com/noticker/status/1'] }, USER_ID);

    expect(result.urlResults[0].status).toBe('error');
    expect(result.urlResults[0].error).toBe('no_tickers_identified');
    expect(mocks.refundAiQuota).toHaveBeenCalledWith(USER_ID);
  });

  it('does not refund quota for exempt users on zero tickers', async () => {
    setupSuccessfulImport();
    mocks.checkOnboardingImportUsed.mockResolvedValue(false); // exempt
    mocks.analyzeDraftContent.mockResolvedValue(mockAnalysis({ stockTickers: [] }));

    await executeBatchImport({ urls: ['https://x.com/noticker/status/1'] }, USER_ID);

    expect(mocks.refundAiQuota).not.toHaveBeenCalled();
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

    expect(mocks.extractArguments).toHaveBeenCalledWith(expect.any(String), 'AAPL', 'Apple Inc.');
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
    mocks.checkOnboardingImportUsed.mockResolvedValue(true);
    mocks.consumeAiQuota.mockResolvedValue(undefined);
    mocks.extractAtHandles.mockReturnValue([]);

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
});
