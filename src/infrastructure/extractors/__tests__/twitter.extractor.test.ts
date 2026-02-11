/**
 * Twitter/X Extractor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { twitterExtractor } from '../twitter.extractor';
import type { ExtractorError } from '../types';

// Helper to build minimal Twitter HTML
function buildTwitterHtml(options: {
  ogTitle?: string;
  ogDescription?: string;
  ogImages?: string[];
  twitterDescription?: string;
  twitterTitle?: string;
  twitterImage?: string;
  jsonLd?: Record<string, unknown>;
  pageTitle?: string;
  publishedTime?: string;
} = {}): string {
  const parts: string[] = ['<html><head>'];

  if (options.ogTitle) {
    parts.push(`<meta property="og:title" content="${options.ogTitle}"/>`);
  }
  if (options.ogDescription) {
    parts.push(`<meta property="og:description" content="${options.ogDescription}"/>`);
  }
  if (options.ogImages) {
    for (const img of options.ogImages) {
      parts.push(`<meta property="og:image" content="${img}"/>`);
    }
  }
  if (options.twitterDescription) {
    parts.push(`<meta name="twitter:description" content="${options.twitterDescription}"/>`);
  }
  if (options.twitterTitle) {
    parts.push(`<meta name="twitter:title" content="${options.twitterTitle}"/>`);
  }
  if (options.twitterImage) {
    parts.push(`<meta name="twitter:image" content="${options.twitterImage}"/>`);
  }
  if (options.jsonLd) {
    parts.push(`<script type="application/ld+json">${JSON.stringify(options.jsonLd)}</script>`);
  }
  if (options.pageTitle) {
    parts.push(`<title>${options.pageTitle}</title>`);
  }
  if (options.publishedTime) {
    parts.push(`<meta property="article:published_time" content="${options.publishedTime}"/>`);
  }

  parts.push('</head><body></body></html>');
  return parts.join('\n');
}

/** Create a mock fetch that returns a fresh Response each time */
function mockFetchResponse(html: string) {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(html, { status: 200 }))
  );
}

describe('TwitterExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate twitter.com URLs', () => {
      expect(twitterExtractor.isValidUrl('https://twitter.com/user/status/123456789')).toBe(true);
    });

    it('should validate x.com URLs', () => {
      expect(twitterExtractor.isValidUrl('https://x.com/ManuInvests/status/2019237463227519273')).toBe(true);
    });

    it('should validate URLs with query parameters', () => {
      expect(twitterExtractor.isValidUrl('https://x.com/IEObserve/status/2019201277025218583?s=20')).toBe(true);
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
      await expect(twitterExtractor.extract('https://facebook.com/share/p/123')).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid Twitter/X URL'),
      } as ExtractorError);
    });

    it('should extract content from valid Twitter URL', async () => {
      const html = buildTwitterHtml({
        ogTitle: 'StockAnalyst on X: &quot;Market analysis for today shows strong results&quot;',
        ogDescription: 'Market analysis for today shows strong results and potential growth',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/StockAnalyst/status/123456789',
        { retryAttempts: 1 }
      );

      expect(result.sourcePlatform).toBe('twitter');
      expect(result.content).toContain('Market analysis');
      expect(result.kolName).toBe('StockAnalyst');
    });

    it('should normalize twitter.com to x.com', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'This tweet content is long enough for testing URL normalization logic',
      });
      const mockFn = mockFetchResponse(html);
      vi.stubGlobal('fetch', mockFn);

      await twitterExtractor.extract(
        'https://twitter.com/user/status/123456789',
        { retryAttempts: 1 }
      );

      expect(mockFn).toHaveBeenCalledWith(
        expect.stringContaining('x.com'),
        expect.any(Object)
      );
    });

    it('should normalize mobile.twitter.com to x.com', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Mobile tweet content is long enough for testing mobile URL normalization',
      });
      const mockFn = mockFetchResponse(html);
      vi.stubGlobal('fetch', mockFn);

      await twitterExtractor.extract(
        'https://mobile.twitter.com/user/status/123456789',
        { retryAttempts: 1 }
      );

      expect(mockFn).toHaveBeenCalledWith(
        expect.not.stringContaining('mobile.'),
        expect.any(Object)
      );
    });

    it('should remove t.co links from content', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Stock price is up today with great momentum https://t.co/abc123',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.content).not.toContain('t.co');
    });

    it('should remove pic.twitter.com links from content', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Stock chart analysis for this quarter pic.twitter.com/xyz789',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.content).not.toContain('pic.twitter.com');
    });

    it('should retry on network failure', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Retry test content is long enough for testing the retry mechanism',
      });
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(html, { status: 200 }))
        );
      vi.stubGlobal('fetch', mockFn);

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 2, timeout: 10000 }
      );

      expect(result.sourcePlatform).toBe('twitter');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw FETCH_FAILED after all retries exhausted', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'));
      vi.stubGlobal('fetch', mockFn);

      await expect(
        twitterExtractor.extract(
          'https://x.com/user/status/123',
          { retryAttempts: 2, timeout: 10000 }
        )
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });

    it('should throw FETCH_FAILED on abort/timeout (wrapped by retry)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      await expect(
        twitterExtractor.extract(
          'https://x.com/user/status/123',
          { retryAttempts: 1, timeout: 100 }
        )
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });
  });

  describe('content parsing', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should extract from og:description', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'This is the main tweet content extracted from og description tag',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('main tweet content extracted from og description');
    });

    it('should extract quoted tweet from og:description', async () => {
      // Twitter wraps tweets in quotes in og:description
      const html = buildTwitterHtml({
        ogDescription: '&quot;This is a quoted tweet content for testing extraction&quot;',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('quoted tweet content');
    });

    it('should extract from twitter:description as fallback', async () => {
      const html = buildTwitterHtml({
        twitterDescription: 'Twitter card description fallback for the tweet content post',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('Twitter card description fallback');
    });

    it('should extract author name from og:title', async () => {
      const html = buildTwitterHtml({
        ogTitle: 'Elon Musk on X: &quot;Some tweet content here for author extraction&quot;',
        ogDescription: 'Some tweet content here for author extraction testing purposes',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/elonmusk/status/123',
        { retryAttempts: 1 }
      );

      expect(result.kolName).toBe('Elon Musk');
    });

    it('should extract author from twitter:title when og:title missing', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Some tweet content for fallback author extraction testing',
        twitterTitle: 'StockGuru',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/stockguru/status/123',
        { retryAttempts: 1 }
      );

      expect(result.kolName).toBe('StockGuru');
    });

    it('should distinguish profile images from post images', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Testing image categorization between profile and post images',
        twitterImage: 'https://pbs.twimg.com/profile_images/123/photo.jpg',
        ogImages: ['https://pbs.twimg.com/media/post_image_1.jpg'],
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.kolAvatarUrl).toContain('profile_images');
      expect(result.images).not.toContainEqual(expect.stringContaining('profile_images'));
    });

    it('should extract from JSON-LD as fallback', async () => {
      const html = buildTwitterHtml({
        jsonLd: {
          articleBody: 'JSON-LD article body content from Twitter post for testing',
          headline: 'Test Headline',
          author: { name: 'JSONLDAuthor' },
          datePublished: '2026-01-15T10:00:00Z',
        },
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('JSON-LD article body');
      expect(result.postedAt).toBe('2026-01-15T10:00:00Z');
    });

    it('should extract from page title as last fallback', async () => {
      const html = buildTwitterHtml({
        pageTitle: 'TestUser on X: "Final page title fallback tweet content for testing"',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('Final page title fallback');
    });

    it('should decode HTML entities', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Markets &amp; bonds show results that are greater than expected',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('Markets & bonds');
    });

    it('should limit images to 10', async () => {
      const ogImages = Array.from({ length: 15 }, (_, i) => `https://pbs.twimg.com/media/img_${i}.jpg`);
      const html = buildTwitterHtml({
        ogDescription: 'Testing image limit to ensure only ten images are returned',
        ogImages,
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.images.length).toBeLessThanOrEqual(10);
    });

    it('should extract published time', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Some tweet content for published time extraction testing',
        publishedTime: '2026-02-10T08:30:00Z',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await twitterExtractor.extract(
        'https://x.com/user/status/123',
        { retryAttempts: 1 }
      );

      expect(result.postedAt).toBe('2026-02-10T08:30:00Z');
    });

    it('should throw CONTENT_TOO_SHORT (wrapped as FETCH_FAILED)', async () => {
      const html = buildTwitterHtml({
        ogDescription: 'Hi',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      await expect(
        twitterExtractor.extract(
          'https://x.com/user/status/123',
          { retryAttempts: 1 }
        )
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });
  });
});
