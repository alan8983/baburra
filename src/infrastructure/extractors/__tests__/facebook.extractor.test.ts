/**
 * Facebook Extractor Tests (Apify-based)
 */

import { describe, it, expect, vi } from 'vitest';
import { facebookExtractor } from '../facebook.extractor';
import type { ExtractorError } from '../types';

// Mock apify-client
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

describe('FacebookExtractor', () => {
  describe('isValidUrl', () => {
    it('should validate facebook.com/share/p/ URLs', () => {
      expect(facebookExtractor.isValidUrl('https://www.facebook.com/share/p/1X6c9WpESv/')).toBe(
        true
      );
    });

    it('should validate facebook.com/{user}/posts/ URLs', () => {
      expect(
        facebookExtractor.isValidUrl('https://www.facebook.com/zuck/posts/10114420763048161')
      ).toBe(true);
    });

    it('should validate facebook.com/permalink.php URLs', () => {
      expect(
        facebookExtractor.isValidUrl('https://www.facebook.com/permalink.php?story_fbid=123456')
      ).toBe(true);
    });

    it('should validate facebook.com video URLs', () => {
      expect(facebookExtractor.isValidUrl('https://www.facebook.com/user/videos/123456')).toBe(
        true
      );
    });

    it('should validate facebook.com photo URLs', () => {
      expect(facebookExtractor.isValidUrl('https://www.facebook.com/photo.php?fbid=123456')).toBe(
        true
      );
    });

    it('should validate fb.com short URLs', () => {
      expect(facebookExtractor.isValidUrl('https://fb.com/abc123')).toBe(true);
    });

    it('should validate mobile facebook URLs', () => {
      expect(facebookExtractor.isValidUrl('https://m.facebook.com/user/posts/123456')).toBe(true);
    });

    it('should reject non-Facebook URLs', () => {
      expect(facebookExtractor.isValidUrl('https://twitter.com/user/status/123')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(facebookExtractor.isValidUrl('not-a-url')).toBe(false);
    });
  });

  describe('extract', () => {
    it('should throw INVALID_URL error for invalid URLs', async () => {
      await expect(
        facebookExtractor.extract('https://twitter.com/user/status/123')
      ).rejects.toMatchObject({
        code: 'INVALID_URL',
        message: expect.stringContaining('Invalid Facebook URL'),
      } as ExtractorError);
    });
  });
});
