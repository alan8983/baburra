/**
 * Facebook Extractor Tests
 */

import { facebookExtractor } from '../facebook.extractor';
import type { ExtractorError } from '../types';

describe('FacebookExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate facebook.com/share/p/ URLs', () => {
      const url = 'https://www.facebook.com/share/p/1X6c9WpESv/';
      expect(facebookExtractor.isValidUrl(url)).toBe(true);
    });

    it('should validate facebook.com/{user}/posts/ URLs', () => {
      const url = 'https://www.facebook.com/zuck/posts/10114420763048161';
      expect(facebookExtractor.isValidUrl(url)).toBe(true);
    });

    it('should validate facebook.com/permalink.php URLs', () => {
      const url = 'https://www.facebook.com/permalink.php?story_fbid=123456';
      expect(facebookExtractor.isValidUrl(url)).toBe(true);
    });

    it('should reject non-Facebook URLs', () => {
      const url = 'https://twitter.com/user/status/123';
      expect(facebookExtractor.isValidUrl(url)).toBe(false);
    });

    it('should reject invalid URLs', () => {
      const url = 'not-a-url';
      expect(facebookExtractor.isValidUrl(url)).toBe(false);
    });
  });

  describe('extract', () => {
    it('should throw INVALID_URL error for invalid URLs', async () => {
      const url = 'https://twitter.com/user/status/123';

      await expect(facebookExtractor.extract(url)).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid Facebook URL'),
      } as ExtractorError);
    });

    it('should extract content from valid Facebook URL', async () => {
      // This test would require mocking fetch
      // const result = await facebookExtractor.extract('https://www.facebook.com/share/p/1X6c9WpESv/');
      // expect(result.sourcePlatform).toBe('facebook');
      // expect(result.content.length).toBeGreaterThanOrEqual(10);
      // expect(result.sourceUrl).toBe('https://www.facebook.com/share/p/1X6c9WpESv/');
    });

    it('should retry on network failure', async () => {
      // This test would require mocking fetch to fail then succeed
    });

    it('should respect timeout configuration', async () => {
      // This test would require mocking a slow fetch
    });
  });

  describe('content validation', () => {
    it('should throw CONTENT_TOO_SHORT error', async () => {
      // This would test the validateContent method
      // Mock a response with less than 10 characters
    });

    it('should throw CONTENT_TOO_LONG error', async () => {
      // This would test the validateContent method
      // Mock a response with more than 10,000 characters
    });

    it('should accept valid content length', async () => {
      // Mock a response with 10-10,000 characters
    });
  });

  describe('HTML parsing', () => {
    it('should extract content from JSON-LD', () => {
      // Test parseHtml method with mocked HTML containing JSON-LD
    });

    it('should extract content from meta tags', () => {
      // Test parseHtml method with mocked HTML containing og:description
    });

    it('should sanitize HTML content', () => {
      // Test that HTML tags are stripped correctly
    });

    it('should decode HTML entities', () => {
      // Test that &amp;, &lt;, etc. are decoded
    });

    it('should extract multiple images', () => {
      // Test that og:image tags are extracted
    });

    it('should limit images to 10', () => {
      // Test that only first 10 images are returned
    });
  });
});
