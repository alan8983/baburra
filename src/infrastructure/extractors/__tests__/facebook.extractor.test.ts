/**
 * Facebook Extractor Tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { facebookExtractor } from '../facebook.extractor';
import type { ExtractorError } from '../types';

// Helper to build minimal Facebook HTML
function buildFacebookHtml(options: {
  ogTitle?: string;
  ogDescription?: string;
  ogImages?: string[];
  ogSiteName?: string;
  jsonLd?: Record<string, unknown>;
  dataAdPreview?: string;
  userContent?: string;
  postMessage?: string;
  paragraph?: string;
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
  if (options.ogSiteName) {
    parts.push(`<meta property="og:site_name" content="${options.ogSiteName}"/>`);
  }
  if (options.jsonLd) {
    parts.push(`<script type="application/ld+json">${JSON.stringify(options.jsonLd)}</script>`);
  }

  parts.push('</head><body>');

  if (options.dataAdPreview) {
    parts.push(`<div data-ad-preview="${options.dataAdPreview}"></div>`);
  }
  if (options.userContent) {
    parts.push(`<div class="userContent">${options.userContent}</div>`);
  }
  if (options.postMessage) {
    parts.push(`<div data-testid="post_message">${options.postMessage}</div>`);
  }
  if (options.paragraph) {
    parts.push(`<p>${options.paragraph}</p>`);
  }

  parts.push('</body></html>');
  return parts.join('\n');
}

/** Create a mock fetch that returns a fresh Response each time */
function mockFetchResponse(html: string) {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(html, { status: 200 }))
  );
}

describe('FacebookExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate facebook.com/share/p/ URLs', () => {
      expect(facebookExtractor.isValidUrl('https://www.facebook.com/share/p/1X6c9WpESv/')).toBe(true);
    });

    it('should validate facebook.com/{user}/posts/ URLs', () => {
      expect(facebookExtractor.isValidUrl('https://www.facebook.com/zuck/posts/10114420763048161')).toBe(true);
    });

    it('should validate facebook.com/permalink.php URLs', () => {
      expect(facebookExtractor.isValidUrl('https://www.facebook.com/permalink.php?story_fbid=123456')).toBe(true);
    });

    it('should validate facebook.com video URLs', () => {
      expect(facebookExtractor.isValidUrl('https://www.facebook.com/user/videos/123456')).toBe(true);
    });

    it('should validate facebook.com photo URLs', () => {
      expect(facebookExtractor.isValidUrl('https://www.facebook.com/photo.php?fbid=123456')).toBe(true);
    });

    it('should reject non-Facebook URLs', () => {
      expect(facebookExtractor.isValidUrl('https://twitter.com/user/status/123')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(facebookExtractor.isValidUrl('not-a-url')).toBe(false);
    });
  });

  describe('extract', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should throw INVALID_URL error for invalid URLs', async () => {
      await expect(facebookExtractor.extract('https://twitter.com/user/status/123')).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid Facebook URL'),
      } as ExtractorError);
    });

    it('should extract content from valid Facebook URL', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'This is a Facebook post with enough content for testing extraction',
        ogTitle: 'Post Title',
        ogSiteName: 'Test Author',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.sourcePlatform).toBe('facebook');
      expect(result.content).toContain('Facebook post');
      expect(result.sourceUrl).toBe('https://www.facebook.com/share/p/1X6c9WpESv/');
    });

    it('should retry on network failure', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'Retry test Facebook content that is long enough for validation',
      });
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(html, { status: 200 }))
        );
      vi.stubGlobal('fetch', mockFn);

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 2, timeout: 10000 }
      );

      expect(result.sourcePlatform).toBe('facebook');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw FETCH_FAILED after all retries exhausted', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
      );

      await expect(
        facebookExtractor.extract(
          'https://www.facebook.com/share/p/1X6c9WpESv/',
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
        facebookExtractor.extract(
          'https://www.facebook.com/share/p/1X6c9WpESv/',
          { retryAttempts: 1, timeout: 100 }
        )
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });
  });

  describe('content validation', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should throw FETCH_FAILED for too-short content', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'Short',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      await expect(
        facebookExtractor.extract(
          'https://www.facebook.com/share/p/1X6c9WpESv/',
          { retryAttempts: 1 }
        )
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });

    it('should throw FETCH_FAILED for too-long content', async () => {
      const longContent = 'A'.repeat(10001);
      const html = buildFacebookHtml({
        ogDescription: longContent,
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      await expect(
        facebookExtractor.extract(
          'https://www.facebook.com/share/p/1X6c9WpESv/',
          { retryAttempts: 1 }
        )
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });

    it('should accept valid content length', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'This is a valid Facebook post content that has enough characters to pass validation',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.content.length).toBeGreaterThanOrEqual(10);
      expect(result.content.length).toBeLessThanOrEqual(10000);
    });
  });

  describe('HTML parsing', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should extract content from JSON-LD', async () => {
      const html = buildFacebookHtml({
        jsonLd: {
          articleBody: 'JSON-LD article body content from Facebook post for testing',
          headline: 'Test Facebook Headline',
          author: { name: 'FB Author' },
          datePublished: '2026-01-15T10:00:00Z',
        },
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('JSON-LD article body');
      expect(result.title).toContain('Test Facebook Headline');
      expect(result.kolName).toBe('FB Author');
      expect(result.postedAt).toBe('2026-01-15T10:00:00Z');
    });

    it('should extract content from og:description as fallback', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'OG description fallback content for the Facebook post testing',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('OG description fallback');
    });

    it('should extract title from og:title', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'This is Facebook post content that is long enough for testing',
        ogTitle: 'My Facebook Post Title',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.title).toBe('My Facebook Post Title');
    });

    it('should extract author from og:site_name', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'This is Facebook post content that is long enough for author test',
        ogSiteName: 'Stock Guru Page',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.kolName).toBe('Stock Guru Page');
    });

    it('should sanitize HTML content from body tags', async () => {
      const html = buildFacebookHtml({
        userContent: '<b>Bold</b> content with <a href="#">link</a> and enough text for validation',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.content).not.toContain('<b>');
      expect(result.content).not.toContain('<a');
      expect(result.content).toContain('Bold');
      expect(result.content).toContain('content');
    });

    it('should decode HTML entities', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'Stocks &amp; bonds are trading &gt; expectations &lt; previous highs',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('Stocks & bonds');
      expect(result.content).toContain('> expectations');
    });

    it('should extract multiple images from og:image', async () => {
      const html = buildFacebookHtml({
        ogDescription: 'Facebook post content with images that is long enough for testing',
        ogImages: [
          'https://scontent.fxx.fbcdn.net/image1.jpg',
          'https://scontent.fxx.fbcdn.net/image2.jpg',
          'https://scontent.fxx.fbcdn.net/image3.jpg',
        ],
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.images).toHaveLength(3);
    });

    it('should limit images to 10', async () => {
      const images = Array.from({ length: 15 }, (_, i) => `https://scontent.fxx.fbcdn.net/image_${i}.jpg`);
      const html = buildFacebookHtml({
        ogDescription: 'Facebook post content with many images for image limit testing',
        ogImages: images,
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.images.length).toBeLessThanOrEqual(10);
    });

    it('should extract from data-ad-preview as fallback', async () => {
      const html = buildFacebookHtml({
        dataAdPreview: 'Ad preview content that serves as fallback for Facebook post',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('Ad preview content');
    });

    it('should extract from post_message div as fallback', async () => {
      const html = buildFacebookHtml({
        postMessage: 'Post message div content that is long enough for testing extraction',
      });
      vi.stubGlobal('fetch', mockFetchResponse(html));

      const result = await facebookExtractor.extract(
        'https://www.facebook.com/share/p/1X6c9WpESv/',
        { retryAttempts: 1 }
      );

      expect(result.content).toContain('Post message div content');
    });
  });
});
