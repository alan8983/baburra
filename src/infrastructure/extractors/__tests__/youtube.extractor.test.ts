/**
 * YouTube Extractor Tests (oEmbed API + youtube-transcript)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { youtubeExtractor } from '../youtube.extractor';
import type { ExtractorError } from '../types';

// Mock youtube-transcript module
vi.mock('youtube-transcript-plus', () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}));

import { YoutubeTranscript } from 'youtube-transcript-plus';

/** Build a mock YouTube oEmbed JSON response */
function buildYouTubeOEmbedResponse(
  options: {
    title?: string;
    authorName?: string;
    authorUrl?: string;
    thumbnailUrl?: string;
  } = {}
) {
  return {
    title: options.title || 'Test Video Title',
    author_name: options.authorName || 'Test Channel',
    author_url: options.authorUrl || 'https://www.youtube.com/@TestChannel',
    thumbnail_url: options.thumbnailUrl || 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    type: 'video',
    provider_name: 'YouTube',
    version: '1.0',
    html: '<iframe></iframe>',
    width: 200,
    height: 113,
  };
}

/** Build mock video page HTML with datePublished meta tag */
function buildVideoPageHtml(datePublished?: string) {
  if (!datePublished) return '<html><body>No date</body></html>';
  return `<html><head><meta itemprop="datePublished" content="${datePublished}"></head><body></body></html>`;
}

/** Create a mock fetch that returns oEmbed JSON for oembed URLs and HTML for video page URLs */
function mockOEmbedFetch(
  response: ReturnType<typeof buildYouTubeOEmbedResponse>,
  datePublished?: string
) {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/oembed')) {
      return Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    // Video page HTML request
    return Promise.resolve(
      new Response(buildVideoPageHtml(datePublished), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );
  });
}

/** Build mock transcript segments */
function buildTranscript(texts: string[]) {
  return texts.map((text, i) => ({ text, duration: 5, offset: i * 5, lang: 'en' }));
}

describe('YouTubeExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate youtube.com/watch URLs', () => {
      expect(youtubeExtractor.isValidUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('should validate youtube.com/watch without www', () => {
      expect(youtubeExtractor.isValidUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('should validate youtu.be short URLs', () => {
      expect(youtubeExtractor.isValidUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    });

    it('should validate m.youtube.com URLs', () => {
      expect(youtubeExtractor.isValidUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('should validate URLs with additional query parameters', () => {
      expect(
        youtubeExtractor.isValidUrl(
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
        )
      ).toBe(true);
    });

    it('should reject non-YouTube URLs', () => {
      expect(youtubeExtractor.isValidUrl('https://twitter.com/user/status/123')).toBe(false);
      expect(youtubeExtractor.isValidUrl('https://vimeo.com/123456')).toBe(false);
    });

    it('should reject YouTube channel URLs', () => {
      expect(youtubeExtractor.isValidUrl('https://www.youtube.com/@channelname')).toBe(false);
      expect(youtubeExtractor.isValidUrl('https://www.youtube.com/channel/UCxyz')).toBe(false);
    });

    it('should reject YouTube playlist URLs', () => {
      expect(
        youtubeExtractor.isValidUrl(
          'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
        )
      ).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(youtubeExtractor.isValidUrl('not-a-url')).toBe(false);
    });
  });

  describe('extract', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.mocked(YoutubeTranscript.fetchTranscript).mockReset();
    });

    it('should throw INVALID_URL error for non-YouTube URLs', async () => {
      await expect(
        youtubeExtractor.extract('https://twitter.com/user/status/123')
      ).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid YouTube URL'),
      } as ExtractorError);
    });

    it('should extract content from valid YouTube URL', async () => {
      const oembedResponse = buildYouTubeOEmbedResponse({
        authorName: 'Graham Stephan',
        title: 'Why The Stock Market Is Crashing',
      });
      vi.stubGlobal('fetch', mockOEmbedFetch(oembedResponse));
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(
        buildTranscript([
          'Today we are going to talk about',
          'why the stock market is experiencing',
          'a significant downturn and what it means for investors',
        ])
      );

      const result = await youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        retryAttempts: 1,
      });

      expect(result.sourcePlatform).toBe('youtube');
      expect(result.content).toContain('stock market');
      expect(result.kolName).toBe('Graham Stephan');
      expect(result.title).toBe('Why The Stock Market Is Crashing');
    });

    it('should return kolName from oEmbed author_name', async () => {
      vi.stubGlobal('fetch', mockOEmbedFetch(buildYouTubeOEmbedResponse({ authorName: '股癌' })));
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(
        buildTranscript(['This is a long enough transcript for validation testing purposes'])
      );

      const result = await youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        retryAttempts: 1,
      });

      expect(result.kolName).toBe('股癌');
    });

    it('should return thumbnail in images array', async () => {
      const thumbnailUrl = 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg';
      vi.stubGlobal('fetch', mockOEmbedFetch(buildYouTubeOEmbedResponse({ thumbnailUrl })));
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(
        buildTranscript(['Transcript content that meets the minimum length validation requirement'])
      );

      const result = await youtubeExtractor.extract('https://youtu.be/abc123', {
        retryAttempts: 1,
      });

      expect(result.images).toEqual([thumbnailUrl]);
    });

    it('should handle youtu.be short URLs', async () => {
      vi.stubGlobal('fetch', mockOEmbedFetch(buildYouTubeOEmbedResponse()));
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(
        buildTranscript(['Short URL transcript content that is long enough for testing'])
      );

      const result = await youtubeExtractor.extract('https://youtu.be/dQw4w9WgXcQ', {
        retryAttempts: 1,
      });

      expect(result.sourcePlatform).toBe('youtube');
    });

    it('should handle m.youtube.com URLs', async () => {
      vi.stubGlobal('fetch', mockOEmbedFetch(buildYouTubeOEmbedResponse()));
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(
        buildTranscript(['Mobile URL transcript content that is long enough for testing'])
      );

      const result = await youtubeExtractor.extract('https://m.youtube.com/watch?v=dQw4w9WgXcQ', {
        retryAttempts: 1,
      });

      expect(result.sourcePlatform).toBe('youtube');
    });

    it('should fall back to title when transcript is unavailable', async () => {
      vi.stubGlobal(
        'fetch',
        mockOEmbedFetch(buildYouTubeOEmbedResponse({ title: 'Why AAPL Will Moon This Quarter' }))
      );
      vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValue(
        new Error('Could not get transcripts')
      );

      const result = await youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        retryAttempts: 1,
      });

      expect(result.sourcePlatform).toBe('youtube');
      expect(result.content).toContain('AAPL Will Moon');
    });

    it('should throw FETCH_FAILED when transcript and description are both unavailable', async () => {
      // oEmbed with no title, page HTML with no description
      const emptyOEmbed = {
        ...buildYouTubeOEmbedResponse(),
        title: '', // explicitly empty (bypasses || default)
      };
      vi.stubGlobal('fetch', mockOEmbedFetch(emptyOEmbed));
      vi.mocked(YoutubeTranscript.fetchTranscript).mockRejectedValue(
        new Error('Could not get transcripts')
      );

      await expect(
        youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
          retryAttempts: 1,
        })
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });

    it('should retry on network failure', async () => {
      const oembedResponse = buildYouTubeOEmbedResponse();
      // First call (attempt 1) fails; subsequent calls succeed with URL-aware routing
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementation((url: string) => {
          if (typeof url === 'string' && url.includes('/oembed')) {
            return Promise.resolve(
              new Response(JSON.stringify(oembedResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            );
          }
          return Promise.resolve(
            new Response(buildVideoPageHtml(), {
              status: 200,
              headers: { 'Content-Type': 'text/html' },
            })
          );
        });
      vi.stubGlobal('fetch', mockFn);
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(
        buildTranscript(['Retry test transcript content that is long enough for validation'])
      );

      const result = await youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        retryAttempts: 2,
        timeout: 10000,
      });

      expect(result.sourcePlatform).toBe('youtube');
    });

    it('should throw FETCH_FAILED after all retries exhausted', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'));
      vi.stubGlobal('fetch', mockFn);

      await expect(
        youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
          retryAttempts: 2,
          timeout: 10000,
        })
      ).rejects.toMatchObject({
        code: 'FETCH_FAILED',
      });
    });

    it('should extract postedAt from video page and set kolAvatarUrl to null', async () => {
      vi.stubGlobal('fetch', mockOEmbedFetch(buildYouTubeOEmbedResponse(), '2025-06-15'));
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(
        buildTranscript(['Testing date extraction for posted at and avatar URL values'])
      );

      const result = await youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        retryAttempts: 1,
      });

      expect(result.postedAt).toBe('2025-06-15');
      expect(result.kolAvatarUrl).toBeNull();
    });

    it('should return null postedAt when video page has no date', async () => {
      vi.stubGlobal('fetch', mockOEmbedFetch(buildYouTubeOEmbedResponse()));
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(
        buildTranscript(['Testing null fields for posted at when no date is available'])
      );

      const result = await youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        retryAttempts: 1,
      });

      expect(result.postedAt).toBeNull();
      expect(result.kolAvatarUrl).toBeNull();
    });

    it('should truncate content exceeding 10000 characters', async () => {
      vi.stubGlobal('fetch', mockOEmbedFetch(buildYouTubeOEmbedResponse()));
      const longText = 'a'.repeat(12000);
      vi.mocked(YoutubeTranscript.fetchTranscript).mockResolvedValue(buildTranscript([longText]));

      const result = await youtubeExtractor.extract('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        retryAttempts: 1,
      });

      expect(result.content.length).toBeLessThanOrEqual(10000);
    });
  });
});
