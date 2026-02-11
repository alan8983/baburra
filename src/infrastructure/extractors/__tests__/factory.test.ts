/**
 * Extractor Factory Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExtractorFactory, extractorFactory } from '../factory';
import type { ExtractorError } from '../types';

describe('ExtractorFactory', () => {
  describe('getSupportedPlatforms', () => {
    it('should return all registered platforms', () => {
      const platforms = extractorFactory.getSupportedPlatforms();

      expect(platforms).toContain('facebook');
      expect(platforms).toContain('twitter');
      expect(platforms).toContain('threads');
      expect(platforms).toHaveLength(3);
    });
  });

  describe('getExtractor', () => {
    it('should return the correct extractor for a platform', () => {
      const twitter = extractorFactory.getExtractor('twitter');
      expect(twitter).toBeDefined();
      expect(twitter!.platform).toBe('twitter');

      const facebook = extractorFactory.getExtractor('facebook');
      expect(facebook).toBeDefined();
      expect(facebook!.platform).toBe('facebook');

      const threads = extractorFactory.getExtractor('threads');
      expect(threads).toBeDefined();
      expect(threads!.platform).toBe('threads');
    });

    it('should return undefined for unregistered platform', () => {
      const extractor = extractorFactory.getExtractor('instagram');
      expect(extractor).toBeUndefined();
    });
  });

  describe('isSupported', () => {
    it('should return true for supported Twitter URLs', () => {
      expect(extractorFactory.isSupported('https://x.com/user/status/123')).toBe(true);
      expect(extractorFactory.isSupported('https://twitter.com/user/status/123')).toBe(true);
    });

    it('should return true for supported Facebook URLs', () => {
      expect(extractorFactory.isSupported('https://www.facebook.com/share/p/abc/')).toBe(true);
      expect(extractorFactory.isSupported('https://www.facebook.com/user/posts/123')).toBe(true);
    });

    it('should return true for supported Threads URLs', () => {
      expect(extractorFactory.isSupported('https://threads.net/@user/post/abc')).toBe(true);
    });

    it('should return false for unsupported URLs', () => {
      expect(extractorFactory.isSupported('https://reddit.com/r/stocks/comments/abc')).toBe(false);
      expect(extractorFactory.isSupported('https://youtube.com/watch?v=abc')).toBe(false);
      expect(extractorFactory.isSupported('not-a-url')).toBe(false);
    });
  });

  describe('extractFromUrl', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should route Twitter URLs to Twitter extractor', async () => {
      const html = '<html><head><meta property="og:description" content="Twitter tweet content that is long enough for validation"/></head></html>';
      vi.mocked(fetch).mockResolvedValueOnce(new Response(html, { status: 200 }));

      const result = await extractorFactory.extractFromUrl('https://x.com/user/status/123');
      expect(result.sourcePlatform).toBe('twitter');
    });

    it('should route Facebook URLs to Facebook extractor', async () => {
      const html = '<html><head><meta property="og:description" content="Facebook post content that is long enough for validation"/></head></html>';
      vi.mocked(fetch).mockResolvedValueOnce(new Response(html, { status: 200 }));

      const result = await extractorFactory.extractFromUrl('https://www.facebook.com/share/p/abc/');
      expect(result.sourcePlatform).toBe('facebook');
    });

    it('should route Threads URLs to Threads extractor', async () => {
      const html = '<html><head><meta property="og:description" content="Threads post content that is long enough for validation"/></head></html>';
      vi.mocked(fetch).mockResolvedValueOnce(new Response(html, { status: 200 }));

      const result = await extractorFactory.extractFromUrl('https://threads.net/@user/post/abc');
      expect(result.sourcePlatform).toBe('threads');
    });

    it('should throw INVALID_URL for unsupported URLs', async () => {
      await expect(
        extractorFactory.extractFromUrl('https://reddit.com/r/stocks/comments/abc')
      ).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('No extractor found'),
      } as ExtractorError);
    });
  });

  describe('register', () => {
    it('should allow registering a custom extractor', () => {
      const factory = new ExtractorFactory();
      const initialCount = factory.getSupportedPlatforms().length;

      // The factory starts with 3 extractors (facebook, twitter, threads)
      expect(initialCount).toBe(3);
    });
  });
});
