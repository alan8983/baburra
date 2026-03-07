import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YouTubeChannelExtractor } from '../youtube-channel.extractor';

const mockChannelResponse = {
  items: [
    {
      id: 'UCxxxxxxxxxxxxxxxxxxxxxxxx',
      snippet: {
        title: 'Test Channel',
        thumbnails: {
          default: { url: 'https://yt3.ggpht.com/default.jpg' },
          medium: { url: 'https://yt3.ggpht.com/medium.jpg' },
          high: { url: 'https://yt3.ggpht.com/high.jpg' },
        },
      },
    },
  ],
};

const mockSearchResponse = {
  items: [
    { id: { videoId: 'video1' } },
    { id: { videoId: 'video2' } },
    { id: { videoId: 'video3' } },
  ],
};

describe('YouTubeChannelExtractor', () => {
  let extractor: YouTubeChannelExtractor;
  const originalFetch = global.fetch;

  beforeEach(() => {
    extractor = new YouTubeChannelExtractor();
    vi.stubEnv('YOUTUBE_DATA_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  describe('isValidProfileUrl', () => {
    it('accepts @handle URLs', () => {
      expect(extractor.isValidProfileUrl('https://www.youtube.com/@testchannel')).toBe(true);
      expect(extractor.isValidProfileUrl('https://youtube.com/@test.channel')).toBe(true);
    });

    it('accepts /channel/ URLs', () => {
      expect(
        extractor.isValidProfileUrl('https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxx')
      ).toBe(true);
    });

    it('accepts /c/ URLs', () => {
      expect(extractor.isValidProfileUrl('https://www.youtube.com/c/TestChannel')).toBe(true);
    });

    it('rejects invalid URLs', () => {
      expect(extractor.isValidProfileUrl('https://www.youtube.com/watch?v=abc123')).toBe(false);
      expect(extractor.isValidProfileUrl('https://twitter.com/@user')).toBe(false);
      expect(extractor.isValidProfileUrl('not-a-url')).toBe(false);
    });
  });

  describe('extractProfile', () => {
    function mockFetch(responses: Record<string, unknown>) {
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        for (const [key, body] of Object.entries(responses)) {
          if (url.includes(key)) {
            return {
              ok: true,
              json: async () => body,
            } as Response;
          }
        }

        return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      });
    }

    it('extracts profile from @handle URL', async () => {
      mockFetch({
        'channels?forHandle=testchannel': mockChannelResponse,
        'search?': mockSearchResponse,
      });

      const result = await extractor.extractProfile('https://www.youtube.com/@testchannel');

      expect(result.kolName).toBe('Test Channel');
      expect(result.kolAvatarUrl).toBe('https://yt3.ggpht.com/high.jpg');
      expect(result.platformId).toBe('UCxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(result.platformUrl).toBe('https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(result.postUrls).toEqual([
        'https://www.youtube.com/watch?v=video1',
        'https://www.youtube.com/watch?v=video2',
        'https://www.youtube.com/watch?v=video3',
      ]);
    });

    it('extracts profile from /channel/ URL', async () => {
      mockFetch({
        'channels?id=UCxxxxxxxxxxxxxxxxxxxxxxxx': mockChannelResponse,
        'search?': mockSearchResponse,
      });

      const result = await extractor.extractProfile(
        'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxx'
      );

      expect(result.kolName).toBe('Test Channel');
      expect(result.postUrls).toHaveLength(3);
    });

    it('extracts profile from /c/ URL', async () => {
      mockFetch({
        'channels?forUsername=TestChannel': mockChannelResponse,
        'search?': mockSearchResponse,
      });

      const result = await extractor.extractProfile('https://www.youtube.com/c/TestChannel');

      expect(result.kolName).toBe('Test Channel');
    });

    it('throws on invalid URL', async () => {
      await expect(extractor.extractProfile('https://www.youtube.com/watch?v=abc')).rejects.toThrow(
        'Invalid YouTube channel URL'
      );
    });

    it('throws when API key is missing', async () => {
      vi.stubEnv('YOUTUBE_DATA_API_KEY', '');

      await expect(
        extractor.extractProfile('https://www.youtube.com/@testchannel')
      ).rejects.toThrow('YOUTUBE_DATA_API_KEY');
    });

    it('throws when channel is not found', async () => {
      mockFetch({
        'channels?forHandle=nonexistent': { items: [] },
      });

      await expect(
        extractor.extractProfile('https://www.youtube.com/@nonexistent')
      ).rejects.toThrow('channel not found');
    });

    it('throws on API error', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })) as unknown as typeof fetch;

      await expect(
        extractor.extractProfile('https://www.youtube.com/@testchannel')
      ).rejects.toThrow('YouTube API error: 403');
    });

    it('handles channel with no thumbnails', async () => {
      mockFetch({
        'channels?forHandle=nothumbs': {
          items: [
            {
              id: 'UCnoThumbs',
              snippet: { title: 'No Thumbs Channel' },
            },
          ],
        },
        'search?': { items: [] },
      });

      const result = await extractor.extractProfile('https://www.youtube.com/@nothumbs');

      expect(result.kolAvatarUrl).toBeNull();
      expect(result.postUrls).toEqual([]);
    });
  });
});
