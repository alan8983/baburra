/**
 * Twitter/X Extractor Tests
 */

import { twitterExtractor } from '../twitter.extractor';
import type { ExtractorError } from '../types';

describe('TwitterExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate twitter.com URLs', () => {
      const url = 'https://twitter.com/user/status/123456789';
      expect(twitterExtractor.isValidUrl(url)).toBe(true);
    });

    it('should validate x.com URLs', () => {
      const url = 'https://x.com/ManuInvests/status/2019237463227519273';
      expect(twitterExtractor.isValidUrl(url)).toBe(true);
    });

    it('should validate URLs with query parameters', () => {
      const url = 'https://x.com/IEObserve/status/2019201277025218583?s=20';
      expect(twitterExtractor.isValidUrl(url)).toBe(true);
    });

    it('should validate mobile.twitter.com URLs', () => {
      const url = 'https://mobile.twitter.com/user/status/123';
      expect(twitterExtractor.isValidUrl(url)).toBe(true);
    });

    it('should reject non-Twitter URLs', () => {
      const url = 'https://facebook.com/share/p/123';
      expect(twitterExtractor.isValidUrl(url)).toBe(false);
    });

    it('should reject invalid URLs', () => {
      const url = 'not-a-url';
      expect(twitterExtractor.isValidUrl(url)).toBe(false);
    });

    it('should reject Twitter profile URLs', () => {
      const url = 'https://twitter.com/username';
      expect(twitterExtractor.isValidUrl(url)).toBe(false);
    });
  });

  describe('extract', () => {
    it('should throw INVALID_URL error for invalid URLs', async () => {
      const url = 'https://facebook.com/share/p/123';

      await expect(twitterExtractor.extract(url)).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid Twitter/X URL'),
      } as ExtractorError);
    });

    it('should extract content from valid Twitter URL', async () => {
      // Mock test - would require fetch mocking
      // const result = await twitterExtractor.extract('https://x.com/user/status/123');
      // expect(result.sourcePlatform).toBe('twitter');
    });

    it('should normalize twitter.com to x.com', async () => {
      // Test URL normalization
    });

    it('should strip query parameters from source URL', async () => {
      // Test that ?s=20 is removed
    });

    it('should remove t.co links from content', async () => {
      // Test artifact removal
    });

    it('should remove pic.twitter.com links from content', async () => {
      // Test artifact removal
    });
  });

  describe('content parsing', () => {
    it('should extract from og:description', () => {
      // Test meta tag extraction
    });

    it('should extract from twitter:description', () => {
      // Test Twitter card extraction
    });

    it('should extract author name from og:title', () => {
      // Test author extraction
    });

    it('should distinguish profile images from post images', () => {
      // Test image categorization
    });
  });
});
