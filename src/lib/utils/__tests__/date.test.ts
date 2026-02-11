/**
 * Date Utils Tests
 */

import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatChartTime,
  parseDate,
  daysBetween,
} from '../date';

describe('date utils', () => {
  describe('formatDate', () => {
    it('should format Date object with default format', () => {
      const date = new Date('2026-01-15T00:00:00Z');
      const result = formatDate(date);
      expect(result).toBe('2026/01/15');
    });

    it('should format date string with default format', () => {
      const result = formatDate('2026-03-20');
      expect(result).toBe('2026/03/20');
    });

    it('should format with custom format string', () => {
      const date = new Date('2026-06-15T00:00:00Z');
      const result = formatDate(date, 'yyyy-MM-dd');
      expect(result).toBe('2026-06-15');
    });

    it('should return "-" for invalid date', () => {
      expect(formatDate('invalid-date')).toBe('-');
    });

    it('should return "-" for empty string', () => {
      expect(formatDate('')).toBe('-');
    });
  });

  describe('formatDateTime', () => {
    it('should format date with time', () => {
      const date = new Date('2026-01-15T14:30:00Z');
      const result = formatDateTime(date);
      // The output will include both date and time
      expect(result).toMatch(/2026\/01\/15/);
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('should format date string with time', () => {
      const result = formatDateTime('2026-03-20T08:00:00Z');
      expect(result).toMatch(/2026\/03\/20/);
    });

    it('should return "-" for invalid date', () => {
      expect(formatDateTime('invalid')).toBe('-');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format Date object as relative time', () => {
      // Recent date should return some relative time string
      const recentDate = new Date(Date.now() - 1000 * 60 * 5); // 5 minutes ago
      const result = formatRelativeTime(recentDate);
      expect(result).toBeTruthy();
      expect(result).not.toBe('-');
    });

    it('should format date string as relative time', () => {
      const recentDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const result = formatRelativeTime(recentDate.toISOString());
      expect(result).toBeTruthy();
      expect(result).not.toBe('-');
    });

    it('should return "-" for invalid date', () => {
      expect(formatRelativeTime('invalid-date')).toBe('-');
    });
  });

  describe('formatChartTime', () => {
    it('should format Date object as YYYY-MM-DD', () => {
      const date = new Date('2026-01-15T14:30:00Z');
      const result = formatChartTime(date);
      expect(result).toBe('2026-01-15');
    });

    it('should format date string as YYYY-MM-DD', () => {
      const result = formatChartTime('2026-06-20T00:00:00Z');
      expect(result).toBe('2026-06-20');
    });

    it('should return empty string for invalid date', () => {
      expect(formatChartTime('invalid')).toBe('');
    });
  });

  describe('parseDate', () => {
    it('should parse valid ISO date string', () => {
      const result = parseDate('2026-01-15');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2026);
    });

    it('should parse ISO datetime string', () => {
      const result = parseDate('2026-06-20T14:30:00Z');
      expect(result).toBeInstanceOf(Date);
    });

    it('should return null for invalid date string', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseDate('')).toBeNull();
    });
  });

  describe('daysBetween', () => {
    it('should calculate days between two dates', () => {
      const date1 = new Date('2026-01-01');
      const date2 = new Date('2026-01-31');
      expect(daysBetween(date1, date2)).toBe(30);
    });

    it('should return positive value regardless of order', () => {
      const date1 = new Date('2026-01-31');
      const date2 = new Date('2026-01-01');
      expect(daysBetween(date1, date2)).toBe(30);
    });

    it('should return 0 for same date', () => {
      const date = new Date('2026-01-15');
      expect(daysBetween(date, date)).toBe(0);
    });

    it('should handle cross-year dates', () => {
      const date1 = new Date('2025-12-01');
      const date2 = new Date('2026-01-30');
      expect(daysBetween(date1, date2)).toBe(60);
    });

    it('should handle large date ranges', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2026-01-01');
      // ~731 days (2 years including leap year)
      const result = daysBetween(date1, date2);
      expect(result).toBeGreaterThanOrEqual(730);
      expect(result).toBeLessThanOrEqual(732);
    });
  });
});
