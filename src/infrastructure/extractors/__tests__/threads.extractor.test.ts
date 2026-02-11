/**
 * Threads Extractor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { threadsExtractor } from '../threads.extractor';
import type { ExtractorError } from '../types';

// Helper to build minimal Threads HTML
function buildThreadsHtml(options: {
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

describe('ThreadsExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate threads.net URLs', () => {
      expect(threadsExtractor.isValidUrl('https://www.threads.net/@username/post/ABC123')).toBe(true);
    });

    it('should validate URLs without www', () => {
      expect(threadsExtractor.isValidUrl('https://threads.net/@stockmktnewz/post/DUV528IDCkx')).toBe(true);
    });

    it('should validate URLs with query parameters', () => {
      expect(threadsExtractor.isValidUrl(
        'https://www.threads.net/@stockmktnewz/post/DUV528IDCkx?xmt=AQF0ItXydd6cM70DM3YYkw'
      )).toBe(true);
    });

    it('should validate URLs with dots in username', () => {
      expect(threadsExtractor.isValidUrl('https://threads.net/@user.name/post/123')).toBe(true);
    });

    it('should reject non-Threads URLs', () => {
      expect(threadsExtractor.isValidUrl('https://twitter.com/user/status/123')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(threadsExtractor.isValidUrl('not-a-url')).toBe(false);
    });

    it('should reject Threads profile URLs', () => {
      expect(threadsExtractor.isValidUrl('https://threads.net/@username')).toBe(false);
    });
  });

  describe('extract', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should throw INVALID_URL error for invalid URLs', async () => {
      await expect(threadsExtractor.extract('https://twitter.com/user/status/123')).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid Threads URL'),
      } as ExtractorError);
    });

    it('should extract content from valid Threads URL', async () => {
      const html = buildThreadsHtml({
        ogTitle: '@testuser on Threads: This is a long enough test post content for validation',
        ogDescription: 'This is a long enough test post content for validation',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@testuser/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.sourcePlatform).toBe('threads');
      expect(result.content).toContain('test post content');
      expect(result.kolName).toBe('@testuser');
    });

    it('should strip query parameters from source URL', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'This is a long enough test post content for Threads validation purposes',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://www.threads.net/@user/post/ABC123?xmt=something',
        { retryAttempts: 1 }
      );

      expect(result.sourceUrl).toBe('https://www.threads.net/@user/post/ABC123');
    });

    it('should extract username from URL and format with @ prefix', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'This is a long enough test post content for Threads testing',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@stockmktnewz/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.kolName).toBe('@stockmktnewz');
    });

    it('should retry on network failure', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'This is a long enough test post content for retry testing',
      });
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(html, { status: 200 }))
        );
      vi.stubGlobal('fetch', mockFn);

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 2, timeout: 10000 }
      );

      expect(result.sourcePlatform).toBe('threads');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw FETCH_FAILED after all retries exhausted', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
      );

      await expect(
        threadsExtractor.extract(
          'https://threads.net/@user/post/ABC123',
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
        threadsExtractor.extract(
          'https://threads.net/@user/post/ABC123',
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
      const html = buildThreadsHtml({
        ogDescription: 'This is the post content from og description meta tag',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.content).toBe('This is the post content from og description meta tag');
    });

    it('should extract from og:title when no og:description', async () => {
      const html = buildThreadsHtml({
        ogTitle: '@testuser on Threads: This is content from the og title meta tag text',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@testuser/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('content from the og title');
      expect(result.kolName).toBe('@testuser');
    });

    it('should remove "| Threads" suffix', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'Some content about stocks and markets | Threads',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.content).not.toContain('| Threads');
      expect(result.content).toContain('stocks and markets');
    });

    it('should remove author suffix from content', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'Some content about stock analysis and finance - @username',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@username/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.content).not.toContain('- @username');
    });

    it('should distinguish profile images from post images', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'This is a long enough content for testing image extraction logic',
        ogImages: [
          'https://scontent.cdninstagram.com/v/profile_pic.jpg',
          'https://scontent.cdninstagram.com/v/post_image_1.jpg',
          'https://scontent.cdninstagram.com/v/post_image_2.jpg',
        ],
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.kolAvatarUrl).toContain('profile');
      expect(result.images).not.toContainEqual(expect.stringContaining('profile'));
    });

    it('should extract from JSON-LD as fallback', async () => {
      const html = buildThreadsHtml({
        jsonLd: {
          articleBody: 'JSON-LD content body that should be long enough for validation',
          headline: 'Test Headline',
          author: { name: 'TestAuthor' },
          datePublished: '2026-01-15T10:00:00Z',
        },
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('JSON-LD content body');
      expect(result.postedAt).toBe('2026-01-15T10:00:00Z');
    });

    it('should extract from twitter:description as fallback', async () => {
      const html = buildThreadsHtml({
        twitterDescription: 'Twitter card description for this Threads post content',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('Twitter card description');
    });

    it('should extract from page title as last fallback', async () => {
      const html = buildThreadsHtml({
        pageTitle: '@testuser on Threads: Final fallback content from page title text',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@testuser/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('fallback content from page title');
    });

    it('should decode HTML entities', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'Stocks &amp; bonds are trading &gt; expectations &lt; previous levels',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('Stocks & bonds');
      expect(result.content).toContain('> expectations');
      expect(result.content).toContain('< previous');
    });

    it('should limit images to 10', async () => {
      const images = Array.from({ length: 15 }, (_, i) => `https://img.example.com/image_${i}.jpg`);
      const html = buildThreadsHtml({
        ogDescription: 'This is content long enough for testing image limit validation',
        ogImages: images,
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.images.length).toBeLessThanOrEqual(10);
    });

    it('should extract published time from article:published_time', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'This is some post content long enough for published time test',
        publishedTime: '2026-02-01T12:00:00Z',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await threadsExtractor.extract(
        'https://threads.net/@user/post/ABC123',
        { retryAttempts: 1 }
      );

      expect(result.postedAt).toBe('2026-02-01T12:00:00Z');
    });

    it('should throw CONTENT_TOO_SHORT (wrapped as FETCH_FAILED)', async () => {
      const html = buildThreadsHtml({
        ogDescription: 'Short',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      await expect(
        threadsExtractor.extract(
          'https://threads.net/@user/post/ABC123',
          { retryAttempts: 1 }
        )
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });
  });
});
