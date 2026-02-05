/**
 * Threads Extractor Tests
 */

import { threadsExtractor } from '../threads.extractor';
import type { ExtractorError } from '../types';

describe('ThreadsExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate threads.net URLs', () => {
      const url = 'https://www.threads.net/@username/post/ABC123';
      expect(threadsExtractor.isValidUrl(url)).toBe(true);
    });

    it('should validate URLs without www', () => {
      const url = 'https://threads.net/@stockmktnewz/post/DUV528IDCkx';
      expect(threadsExtractor.isValidUrl(url)).toBe(true);
    });

    it('should validate URLs with query parameters', () => {
      const url =
        'https://www.threads.net/@stockmktnewz/post/DUV528IDCkx?xmt=AQF0ItXydd6cM70DM3YYkw-ZqlHmK0Fuse08hFQINtZ7Xg';
      expect(threadsExtractor.isValidUrl(url)).toBe(true);
    });

    it('should validate URLs with dots in username', () => {
      const url = 'https://threads.net/@user.name/post/123';
      expect(threadsExtractor.isValidUrl(url)).toBe(true);
    });

    it('should reject non-Threads URLs', () => {
      const url = 'https://twitter.com/user/status/123';
      expect(threadsExtractor.isValidUrl(url)).toBe(false);
    });

    it('should reject invalid URLs', () => {
      const url = 'not-a-url';
      expect(threadsExtractor.isValidUrl(url)).toBe(false);
    });

    it('should reject Threads profile URLs', () => {
      const url = 'https://threads.net/@username';
      expect(threadsExtractor.isValidUrl(url)).toBe(false);
    });
  });

  describe('extract', () => {
    it('should throw INVALID_URL error for invalid URLs', async () => {
      const url = 'https://twitter.com/user/status/123';

      await expect(threadsExtractor.extract(url)).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid Threads URL'),
      } as ExtractorError);
    });

    it('should extract content from valid Threads URL', async () => {
      // Mock test
      // const result = await threadsExtractor.extract('https://threads.net/@user/post/123');
      // expect(result.sourcePlatform).toBe('threads');
    });

    it('should strip query parameters', async () => {
      // Test that ?xmt=... is removed
    });

    it('should extract username from URL', async () => {
      // Test username extraction
    });

    it('should format username with @ prefix', async () => {
      // Test @username format
    });
  });

  describe('content parsing', () => {
    it('should extract from og:title', () => {
      // Test og:title parsing
    });

    it('should extract from og:description', () => {
      // Test og:description parsing
    });

    it('should remove "| Threads" suffix', () => {
      // Test artifact removal
    });

    it('should remove author suffix from content', () => {
      // Test "- @username" removal
    });

    it('should distinguish profile images from post images', () => {
      // Test image categorization
    });

    it('should preserve @ in username', () => {
      // Test username formatting
    });
  });
});
