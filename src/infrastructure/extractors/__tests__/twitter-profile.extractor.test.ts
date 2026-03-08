/**
 * Twitter/X Profile Extractor Tests
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { twitterProfileExtractor } from '../twitter-profile.extractor';

function buildUserInfoResponse(
  overrides: Partial<{ name: string; userName: string; profilePicture: string }> = {}
) {
  return {
    data: {
      id: '123456',
      name: overrides.name ?? 'Elon Musk',
      userName: overrides.userName ?? 'elonmusk',
      profilePicture: overrides.profilePicture ?? 'https://pbs.twimg.com/profile/avatar.jpg',
      description: 'CEO of everything',
      followers: 100000,
      following: 200,
    },
    status: 'success',
  };
}

function buildTimelineResponse(
  tweets: Array<{ id: string; text: string; type?: string }>,
  hasNextPage = false,
  nextCursor = ''
) {
  return {
    tweets: tweets.map((t) => ({
      id: t.id,
      url: `https://x.com/elonmusk/status/${t.id}`,
      text: t.text,
      type: t.type ?? 'tweet',
      createdAt: '2026-01-15T10:00:00Z',
      author: { userName: 'elonmusk' },
    })),
    has_next_page: hasNextPage,
    next_cursor: nextCursor,
  };
}

function mockFetchSequence(...responses: object[]) {
  const fn = vi.fn();
  for (const resp of responses) {
    fn.mockResolvedValueOnce(
      new Response(JSON.stringify(resp), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
  return fn;
}

describe('TwitterProfileExtractor', () => {
  describe('isValidProfileUrl', () => {
    it('should accept https://x.com/elonmusk', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/elonmusk')).toBe(true);
    });

    it('should accept https://twitter.com/elonmusk', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://twitter.com/elonmusk')).toBe(true);
    });

    it('should accept https://www.x.com/elonmusk/', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://www.x.com/elonmusk/')).toBe(true);
    });

    it('should accept URL with query params', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/user?s=20')).toBe(true);
    });

    it('should reject individual tweet URLs', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/user/status/123456')).toBe(
        false
      );
    });

    it('should reject /home', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/home')).toBe(false);
    });

    it('should reject /explore', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/explore')).toBe(false);
    });

    it('should reject /search', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/search')).toBe(false);
    });

    it('should reject /settings', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/settings')).toBe(false);
    });

    it('should reject /i/flow paths', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/i/flow')).toBe(false);
    });

    it('should reject non-Twitter URLs', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://youtube.com/channel/123')).toBe(
        false
      );
    });

    it('should reject bare domain with no username', () => {
      expect(twitterProfileExtractor.isValidProfileUrl('https://x.com/')).toBe(false);
    });
  });

  describe('extractProfile', () => {
    beforeEach(() => {
      vi.stubEnv('TWITTERAPI_IO_KEY', 'test-api-key');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('should extract profile info and tweet URLs', async () => {
      const userInfo = buildUserInfoResponse();
      const timeline = buildTimelineResponse([
        { id: '1001', text: 'Tweet 1' },
        { id: '1002', text: 'Tweet 2' },
        { id: '1003', text: 'Tweet 3' },
      ]);

      vi.stubGlobal('fetch', mockFetchSequence(userInfo, timeline));

      const result = await twitterProfileExtractor.extractProfile('https://x.com/elonmusk');

      expect(result.kolName).toBe('Elon Musk');
      expect(result.kolAvatarUrl).toBe('https://pbs.twimg.com/profile/avatar.jpg');
      expect(result.platformId).toBe('elonmusk');
      expect(result.platformUrl).toBe('https://x.com/elonmusk');
      expect(result.postUrls).toHaveLength(3);
      expect(result.postUrls).toContain('https://x.com/elonmusk/status/1001');
      expect(result.postUrls).toContain('https://x.com/elonmusk/status/1003');
    });

    it('should filter out retweets', async () => {
      const userInfo = buildUserInfoResponse();
      const timeline = buildTimelineResponse([
        { id: '1001', text: 'Original tweet', type: 'tweet' },
        { id: '1002', text: 'RT something', type: 'retweet' },
        { id: '1003', text: 'Another original', type: 'tweet' },
      ]);

      vi.stubGlobal('fetch', mockFetchSequence(userInfo, timeline));

      const result = await twitterProfileExtractor.extractProfile('https://x.com/elonmusk');

      expect(result.postUrls).toHaveLength(2);
      expect(result.postUrls).not.toContain('https://x.com/elonmusk/status/1002');
    });

    it('should throw when TWITTERAPI_IO_KEY is missing', async () => {
      vi.stubEnv('TWITTERAPI_IO_KEY', '');
      // Clear the env var entirely
      delete process.env.TWITTERAPI_IO_KEY;

      await expect(
        twitterProfileExtractor.extractProfile('https://x.com/elonmusk')
      ).rejects.toThrow('TWITTERAPI_IO_KEY environment variable is not set');
    });

    it('should throw when user is not found', async () => {
      const errorResponse = { data: null, status: 'error' };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(errorResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await expect(
        twitterProfileExtractor.extractProfile('https://x.com/nonexistentuser')
      ).rejects.toThrow('Twitter user not found');
    });

    it('should throw on 500 API error immediately', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('Internal Server Error', {
            status: 500,
            statusText: 'Internal Server Error',
          })
        )
      );

      await expect(
        twitterProfileExtractor.extractProfile('https://x.com/elonmusk')
      ).rejects.toThrow('Twitter API error: 500');
    });

    it('should retry on 429 then throw after retries exhausted', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('Rate limited', {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'retry-after': '0' },
          })
        )
      );

      await expect(
        twitterProfileExtractor.extractProfile('https://x.com/elonmusk')
      ).rejects.toThrow('Twitter API error: 429');
    });

    it('should return empty postUrls for empty timeline', async () => {
      const userInfo = buildUserInfoResponse();
      const emptyTimeline = { tweets: [], has_next_page: false, next_cursor: '' };

      vi.stubGlobal('fetch', mockFetchSequence(userInfo, emptyTimeline));

      const result = await twitterProfileExtractor.extractProfile('https://x.com/elonmusk');

      expect(result.postUrls).toEqual([]);
      expect(result.kolName).toBe('Elon Musk');
    });
  });
});
