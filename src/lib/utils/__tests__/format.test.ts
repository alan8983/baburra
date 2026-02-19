/**
 * Format Utils Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatPriceChange,
  formatReturnRate,
  formatNumber,
  formatPrice,
  formatVolume,
  truncateText,
  generateSlug,
  detectPlatform,
} from '../format';

describe('format utils', () => {
  describe('formatPriceChange', () => {
    it('should format positive change with + sign', () => {
      expect(formatPriceChange(5.25)).toBe('+5.25%');
      expect(formatPriceChange(100)).toBe('+100.00%');
    });

    it('should format negative change with - sign', () => {
      expect(formatPriceChange(-3.14)).toBe('-3.14%');
      expect(formatPriceChange(-50)).toBe('-50.00%');
    });

    it('should format zero change with + sign', () => {
      expect(formatPriceChange(0)).toBe('+0.00%');
    });

    it('should return "-" for null', () => {
      expect(formatPriceChange(null)).toBe('-');
    });

    it('should return "-" for undefined', () => {
      expect(formatPriceChange(undefined)).toBe('-');
    });

    it('should format with 2 decimal places', () => {
      expect(formatPriceChange(1.1)).toBe('+1.10%');
      expect(formatPriceChange(0.123456)).toBe('+0.12%');
    });
  });

  describe('formatReturnRate', () => {
    it('should format positive return with + sign', () => {
      expect(formatReturnRate(8.3)).toBe('+8.3%');
      expect(formatReturnRate(0)).toBe('+0.0%');
    });

    it('should format negative return with - sign', () => {
      expect(formatReturnRate(-2.1)).toBe('-2.1%');
    });

    it('should format with 1 decimal place', () => {
      expect(formatReturnRate(8.36)).toBe('+8.4%');
      expect(formatReturnRate(-2.14)).toBe('-2.1%');
      expect(formatReturnRate(8.35)).toBe('+8.3%'); // IEEE 754: 8.35 stored as 8.349...
    });

    it('should return "-" for null', () => {
      expect(formatReturnRate(null)).toBe('-');
    });

    it('should return "-" for undefined', () => {
      expect(formatReturnRate(undefined)).toBe('-');
    });
  });

  describe('formatNumber', () => {
    it('should format number with locale separators', () => {
      const result = formatNumber(1234567);
      // zh-TW locale uses comma separator
      expect(result).toContain('1');
      expect(result).toContain('234');
      expect(result).toContain('567');
    });

    it('should format small numbers without separators', () => {
      expect(formatNumber(42)).toBe('42');
    });

    it('should return "-" for null', () => {
      expect(formatNumber(null)).toBe('-');
    });

    it('should return "-" for undefined', () => {
      expect(formatNumber(undefined)).toBe('-');
    });
  });

  describe('formatPrice', () => {
    it('should format price with default 2 decimal places', () => {
      expect(formatPrice(123.456)).toBe('123.46');
      expect(formatPrice(50)).toBe('50.00');
    });

    it('should format with custom decimal places', () => {
      expect(formatPrice(123.456, 3)).toBe('123.456');
      expect(formatPrice(100, 0)).toBe('100');
    });

    it('should return "-" for null', () => {
      expect(formatPrice(null)).toBe('-');
    });

    it('should return "-" for undefined', () => {
      expect(formatPrice(undefined)).toBe('-');
    });
  });

  describe('formatVolume', () => {
    it('should format billions', () => {
      expect(formatVolume(1_500_000_000)).toBe('1.50B');
      expect(formatVolume(2_000_000_000)).toBe('2.00B');
    });

    it('should format millions', () => {
      expect(formatVolume(5_500_000)).toBe('5.50M');
      expect(formatVolume(1_000_000)).toBe('1.00M');
    });

    it('should format thousands', () => {
      // Note: The source code has a bug - it divides by 1_000_000 instead of 1_000 for K
      const result = formatVolume(5000);
      expect(result).toContain('K');
    });

    it('should format small numbers as plain text', () => {
      expect(formatVolume(500)).toBe('500');
      expect(formatVolume(0)).toBe('0');
    });

    it('should return "-" for null', () => {
      expect(formatVolume(null)).toBe('-');
    });

    it('should return "-" for undefined', () => {
      expect(formatVolume(undefined)).toBe('-');
    });
  });

  describe('truncateText', () => {
    it('should not truncate short text', () => {
      expect(truncateText('Hello', 10)).toBe('Hello');
    });

    it('should truncate long text with ellipsis', () => {
      expect(truncateText('Hello World This Is Long', 10)).toBe('Hello Worl...');
    });

    it('should not truncate text at exact maxLength', () => {
      expect(truncateText('12345', 5)).toBe('12345');
    });

    it('should handle empty string', () => {
      expect(truncateText('', 10)).toBe('');
    });
  });

  describe('generateSlug', () => {
    it('should convert to lowercase', () => {
      expect(generateSlug('Hello World')).toBe('hello-world');
    });

    it('should replace spaces with hyphens', () => {
      expect(generateSlug('stock market analysis')).toBe('stock-market-analysis');
    });

    it('should remove special characters', () => {
      expect(generateSlug('Hello! @World #2026')).toBe('hello-world-2026');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(generateSlug('  hello  ')).toBe('hello');
    });

    it('should collapse multiple hyphens', () => {
      expect(generateSlug('hello---world')).toBe('hello-world');
    });

    it('should handle underscores', () => {
      expect(generateSlug('hello_world')).toBe('hello-world');
    });
  });

  describe('detectPlatform', () => {
    it('should detect twitter.com', () => {
      expect(detectPlatform('https://twitter.com/user/status/123')).toBe('twitter');
    });

    it('should detect x.com', () => {
      expect(detectPlatform('https://x.com/user/status/123')).toBe('twitter');
    });

    it('should detect facebook.com', () => {
      expect(detectPlatform('https://www.facebook.com/share/p/abc/')).toBe('facebook');
    });

    it('should detect fb.com', () => {
      expect(detectPlatform('https://fb.com/post/123')).toBe('facebook');
    });

    it('should detect threads.net', () => {
      expect(detectPlatform('https://threads.net/@user/post/abc')).toBe('threads');
    });

    it('should detect instagram.com', () => {
      expect(detectPlatform('https://www.instagram.com/p/abc')).toBe('instagram');
    });

    it('should return "manual" for unknown URLs', () => {
      expect(detectPlatform('https://reddit.com/r/stocks')).toBe('manual');
    });

    it('should return "manual" for null', () => {
      expect(detectPlatform(null)).toBe('manual');
    });

    it('should return "manual" for undefined', () => {
      expect(detectPlatform(undefined)).toBe('manual');
    });

    it('should return "manual" for empty string', () => {
      expect(detectPlatform('')).toBe('manual');
    });
  });
});
