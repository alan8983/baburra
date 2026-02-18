/**
 * Twitter/X Extractor Tests (oEmbed API)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { twitterExtractor } from '../twitter.extractor';
import type { ExtractorError } from '../types';

/** Build a mock oEmbed JSON response */
function buildOEmbedResponse(
  options: {
    url?: string;
    authorName?: string;
    authorUrl?: string;
    tweetText?: string;
  } = {}
) {
  const text = options.tweetText || 'Default tweet text content for testing purposes';
  const authorName = options.authorName || 'Test User';
  return {
    url: options.url || 'https://twitter.com/testuser/status/123',
    author_name: authorName,
    author_url: options.authorUrl || 'https://twitter.com/testuser',
    html: `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">${text}</p>&mdash; ${authorName} (@testuser) <a href="https://twitter.com/testuser/status/123">January 15, 2026</a></blockquote>`,
    width: 550,
    type: 'rich',
    provider_name: 'Twitter',
    version: '1.0',
  };
}

/** Create a mock fetch that returns oEmbed JSON */
function mockOEmbedFetch(response: ReturnType<typeof buildOEmbedResponse>) {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );
}

describe('TwitterExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate twitter.com URLs', () => {
      expect(twitterExtractor.isValidUrl('https://twitter.com/user/status/123456789')).toBe(true);
    });

    it('should validate x.com URLs', () => {
      expect(
        twitterExtractor.isValidUrl('https://x.com/ManuInvests/status/2019237463227519273')
      ).toBe(true);
    });

    it('should validate URLs with query parameters', () => {
      expect(
        twitterExtractor.isValidUrl('https://x.com/IEObserve/status/2019201277025218583?s=20')
      ).toBe(true);
    });

    it('should validate mobile.twitter.com URLs', () => {
      expect(twitterExtractor.isValidUrl('https://mobile.twitter.com/user/status/123')).toBe(true);
    });

    it('should reject non-Twitter URLs', () => {
      expect(twitterExtractor.isValidUrl('https://facebook.com/share/p/123')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(twitterExtractor.isValidUrl('not-a-url')).toBe(false);
    });

    it('should reject Twitter profile URLs', () => {
      expect(twitterExtractor.isValidUrl('https://twitter.com/username')).toBe(false);
    });
  });

  describe('extract', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should throw INVALID_URL error for invalid URLs', async () => {
      await expect(
        twitterExtractor.extract('https://facebook.com/share/p/123')
      ).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid Twitter/X URL'),
      } as ExtractorError);
    });

    it('should extract content from valid Twitter URL via oEmbed', async () => {
      const response = buildOEmbedResponse({
        authorName: 'StockAnalyst',
        tweetText: 'Market analysis for today shows strong results and potential growth',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/StockAnalyst/status/123456789', {
        retryAttempts: 1,
      });

      expect(result.sourcePlatform).toBe('twitter');
      expect(result.content).toContain('Market analysis');
      expect(result.kolName).toBe('StockAnalyst');
    });

    it('should call oEmbed API with correct URL', async () => {
      const response = buildOEmbedResponse({
        tweetText: 'Testing oEmbed API URL construction for Twitter extraction',
      });
      const mockFn = mockOEmbedFetch(response);
      vi.stubGlobal('fetch', mockFn);

      await twitterExtractor.extract('https://x.com/user/status/123456789', {
        retryAttempts: 1,
      });

      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining('https://publish.twitter.com/oembed'),
        expect.any(Object)
      );
      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining('omit_script=true'),
        expect.any(Object)
      );
    });

    it('should remove t.co links from content', async () => {
      const response = buildOEmbedResponse({
        tweetText: 'Stock price is up today with great momentum https://t.co/abc123',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/user/status/123', {
        retryAttempts: 1,
      });

      expect(result.content).not.toContain('t.co');
    });

    it('should remove pic.twitter.com links from content', async () => {
      const response = buildOEmbedResponse({
        tweetText: 'Stock chart analysis for this quarter pic.twitter.com/xyz789',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/user/status/123', {
        retryAttempts: 1,
      });

      expect(result.content).not.toContain('pic.twitter.com');
    });

    it('should retry on network failure', async () => {
      const response = buildOEmbedResponse({
        tweetText: 'Retry test content is long enough for testing the retry mechanism',
      });
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(JSON.stringify(response), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        );
      vi.stubGlobal('fetch', mockFn);

      const result = await twitterExtractor.extract('https://x.com/user/status/123', {
        retryAttempts: 2,
        timeout: 10000,
      });

      expect(result.sourcePlatform).toBe('twitter');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw FETCH_FAILED after all retries exhausted', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'));
      vi.stubGlobal('fetch', mockFn);

      await expect(
        twitterExtractor.extract('https://x.com/user/status/123', {
          retryAttempts: 2,
          timeout: 10000,
        })
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });

    it('should throw FETCH_FAILED on abort/timeout (wrapped by retry)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      await expect(
        twitterExtractor.extract('https://x.com/user/status/123', {
          retryAttempts: 1,
          timeout: 100,
        })
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });
  });

  describe('content parsing', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should extract tweet text from oEmbed html <p> tag', async () => {
      const response = buildOEmbedResponse({
        tweetText: 'This is the main tweet content extracted from oEmbed response',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/user/status/123', {
        retryAttempts: 1,
      });

      expect(result.content).toContain('main tweet content extracted from oEmbed');
    });

    it('should extract author name from oEmbed author_name', async () => {
      const response = buildOEmbedResponse({
        authorName: 'Elon Musk',
        tweetText: 'Some tweet content here for author extraction testing purposes',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/elonmusk/status/123', {
        retryAttempts: 1,
      });

      expect(result.kolName).toBe('Elon Musk');
    });

    it('should use oEmbed canonical url as sourceUrl', async () => {
      const response = buildOEmbedResponse({
        url: 'https://twitter.com/user/status/999',
        tweetText: 'Testing canonical URL mapping from oEmbed response data',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/user/status/999', {
        retryAttempts: 1,
      });

      expect(result.sourceUrl).toBe('https://twitter.com/user/status/999');
    });

    it('should decode HTML entities in tweet content', async () => {
      const response = buildOEmbedResponse({
        tweetText: 'Markets &amp; bonds show results that are greater than expected',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/user/status/123', {
        retryAttempts: 1,
      });

      expect(result.content).toContain('Markets & bonds');
    });

    it('should strip HTML tags from tweet content', async () => {
      const response = buildOEmbedResponse({
        tweetText:
          'Check out <a href="https://example.com">this amazing stock analysis article</a> for details',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/user/status/123', {
        retryAttempts: 1,
      });

      expect(result.content).not.toContain('<a');
      expect(result.content).toContain('this amazing stock analysis article');
    });

    it('should set images, postedAt, kolAvatarUrl to null/empty', async () => {
      const response = buildOEmbedResponse({
        tweetText: 'Testing that oEmbed does not provide images or timestamps',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      const result = await twitterExtractor.extract('https://x.com/user/status/123', {
        retryAttempts: 1,
      });

      expect(result.images).toEqual([]);
      expect(result.postedAt).toBeNull();
      expect(result.kolAvatarUrl).toBeNull();
      expect(result.title).toBeNull();
    });

    it('should throw CONTENT_TOO_SHORT (wrapped as FETCH_FAILED)', async () => {
      const response = buildOEmbedResponse({
        tweetText: 'Hi',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(response));

      await expect(
        twitterExtractor.extract('https://x.com/user/status/123', { retryAttempts: 1 })
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });
  });
});
