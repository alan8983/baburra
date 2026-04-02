/**
 * Extractor Factory Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExtractorFactory, extractorFactory } from '../factory';
import type { ExtractorError } from '../types';

// Mock youtube-transcript-plus to avoid real network calls from factory initialization
vi.mock('youtube-transcript-plus', () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}));

// Mock apify-client to avoid real API calls
vi.mock('apify-client', () => {
  class MockApifyClient {
    actor() {
      return { call: vi.fn(), start: vi.fn() };
    }
    dataset() {
      return { listItems: vi.fn().mockResolvedValue({ items: [] }) };
    }
    run() {
      return { get: vi.fn() };
    }
  }
  return { ApifyClient: MockApifyClient };
});

describe('ExtractorFactory', () => {
  describe('getSupportedPlatforms', () => {
    it('should return all registered platforms', () => {
      const platforms = extractorFactory.getSupportedPlatforms();

      expect(platforms).toContain('twitter');
      expect(platforms).toContain('youtube');
      expect(platforms).toContain('tiktok');
      expect(platforms).toContain('facebook');
      expect(platforms).toHaveLength(4);
    });
  });

  describe('getExtractor', () => {
    it('should return the correct extractor for twitter', () => {
      const twitter = extractorFactory.getExtractor('twitter');
      expect(twitter).toBeDefined();
      expect(twitter!.platform).toBe('twitter');
    });

    it('should return the correct extractor for youtube', () => {
      const youtube = extractorFactory.getExtractor('youtube');
      expect(youtube).toBeDefined();
      expect(youtube!.platform).toBe('youtube');
    });

    it('should return the correct extractor for tiktok', () => {
      const tiktok = extractorFactory.getExtractor('tiktok');
      expect(tiktok).toBeDefined();
      expect(tiktok!.platform).toBe('tiktok');
    });

    it('should return the correct extractor for facebook', () => {
      const facebook = extractorFactory.getExtractor('facebook');
      expect(facebook).toBeDefined();
      expect(facebook!.platform).toBe('facebook');
    });

    it('should return undefined for unregistered platforms', () => {
      expect(extractorFactory.getExtractor('threads')).toBeUndefined();
      expect(extractorFactory.getExtractor('instagram')).toBeUndefined();
    });
  });

  describe('isSupported', () => {
    it('should return true for supported Twitter URLs', () => {
      expect(extractorFactory.isSupported('https://x.com/user/status/123')).toBe(true);
      expect(extractorFactory.isSupported('https://twitter.com/user/status/123')).toBe(true);
    });

    it('should return true for supported YouTube URLs', () => {
      expect(extractorFactory.isSupported('https://www.youtube.com/watch?v=abc123')).toBe(true);
      expect(extractorFactory.isSupported('https://youtu.be/abc123')).toBe(true);
      expect(extractorFactory.isSupported('https://m.youtube.com/watch?v=abc123')).toBe(true);
    });

    it('should return true for supported TikTok URLs', () => {
      expect(extractorFactory.isSupported('https://www.tiktok.com/@user/video/1234567890')).toBe(
        true
      );
      expect(extractorFactory.isSupported('https://vm.tiktok.com/abc123')).toBe(true);
    });

    it('should return true for supported Facebook URLs', () => {
      expect(extractorFactory.isSupported('https://www.facebook.com/share/p/abc/')).toBe(true);
      expect(extractorFactory.isSupported('https://www.facebook.com/user/posts/123')).toBe(true);
    });

    it('should return false for unsupported URLs', () => {
      expect(extractorFactory.isSupported('https://threads.net/@user/post/abc')).toBe(false);
      expect(extractorFactory.isSupported('https://reddit.com/r/stocks/comments/abc')).toBe(false);
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
      const oembedResponse = {
        url: 'https://twitter.com/user/status/123',
        author_name: 'Test User',
        author_url: 'https://twitter.com/user',
        html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Twitter tweet content that is long enough for validation</p>&mdash; Test User (@user)</blockquote>',
        width: 550,
        type: 'rich',
        provider_name: 'Twitter',
        version: '1.0',
      };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(oembedResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await extractorFactory.extractFromUrl('https://x.com/user/status/123');
      expect(result.sourcePlatform).toBe('twitter');
    });

    it('should throw INVALID_URL for unsupported URLs', async () => {
      await expect(
        extractorFactory.extractFromUrl('https://reddit.com/r/stocks/comments/abc')
      ).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('No extractor found'),
      } as ExtractorError);
    });

    it('should throw INVALID_URL for Threads URLs', async () => {
      await expect(
        extractorFactory.extractFromUrl('https://threads.net/@user/post/abc')
      ).rejects.toMatchObject({
        code: 'INVALID_URL',
      } as ExtractorError);
    });
  });

  describe('register', () => {
    it('should start with all default extractors registered', () => {
      const factory = new ExtractorFactory();
      expect(factory.getSupportedPlatforms()).toHaveLength(4);
      expect(factory.getSupportedPlatforms()).toContain('twitter');
      expect(factory.getSupportedPlatforms()).toContain('youtube');
      expect(factory.getSupportedPlatforms()).toContain('tiktok');
      expect(factory.getSupportedPlatforms()).toContain('facebook');
    });
  });
});
