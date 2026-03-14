import { describe, it, expect } from 'vitest';
import {
  isUrlLike,
  getSupportedPlatform,
  getPlannedPlatform,
  getSupportedPlatformNames,
  getPlannedPlatformNames,
} from '../url';

describe('isUrlLike', () => {
  it('returns true for https URL', () => {
    expect(isUrlLike('https://example.com')).toBe(true);
  });

  it('returns true for http URL', () => {
    expect(isUrlLike('http://example.com')).toBe(true);
  });

  it('returns true for URL with path, query, and fragment', () => {
    expect(isUrlLike('https://example.com/path?q=1#section')).toBe(true);
  });

  it('returns false for ftp URL', () => {
    expect(isUrlLike('ftp://example.com')).toBe(false);
  });

  it('returns false for plain text', () => {
    expect(isUrlLike('buy AAPL now')).toBe(false);
  });

  it('returns false for domain without protocol', () => {
    expect(isUrlLike('example.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isUrlLike('')).toBe(false);
  });

  it('handles leading and trailing whitespace', () => {
    expect(isUrlLike('  https://example.com  ')).toBe(true);
  });
});

describe('getSupportedPlatform', () => {
  it('returns "Twitter / X" for twitter.com URL', () => {
    expect(getSupportedPlatform('https://twitter.com/user/status/123')).toBe('Twitter / X');
  });

  it('returns "Twitter / X" for x.com URL', () => {
    expect(getSupportedPlatform('https://x.com/user/status/123')).toBe('Twitter / X');
  });

  it('returns "YouTube" for youtube.com URL', () => {
    expect(getSupportedPlatform('https://youtube.com/watch?v=abc')).toBe('YouTube');
  });

  it('returns "YouTube" for youtu.be URL', () => {
    expect(getSupportedPlatform('https://youtu.be/abc')).toBe('YouTube');
  });

  it('returns null for facebook.com (not supported)', () => {
    expect(getSupportedPlatform('https://facebook.com/post/123')).toBeNull();
  });

  it('returns null for unknown domain', () => {
    expect(getSupportedPlatform('https://example.com')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(getSupportedPlatform('https://TWITTER.COM/user')).toBe('Twitter / X');
    expect(getSupportedPlatform('https://YOUTUBE.COM/watch?v=x')).toBe('YouTube');
  });

  it('handles whitespace around URL', () => {
    expect(getSupportedPlatform('  https://x.com/user  ')).toBe('Twitter / X');
  });
});

describe('getPlannedPlatform', () => {
  it('returns "Facebook" for facebook.com', () => {
    expect(getPlannedPlatform('https://facebook.com/post/123')).toBe('Facebook');
  });

  it('returns "Facebook" for fb.com', () => {
    expect(getPlannedPlatform('https://fb.com/post/123')).toBe('Facebook');
  });

  it('returns "Facebook" for fb.watch', () => {
    expect(getPlannedPlatform('https://fb.watch/abc')).toBe('Facebook');
  });

  it('returns "Threads" for threads.net', () => {
    expect(getPlannedPlatform('https://threads.net/@user/post/123')).toBe('Threads');
  });

  it('returns null for twitter.com (supported, not planned)', () => {
    expect(getPlannedPlatform('https://twitter.com/user')).toBeNull();
  });

  it('returns null for unknown domain', () => {
    expect(getPlannedPlatform('https://example.com')).toBeNull();
  });
});

describe('getSupportedPlatformNames', () => {
  it('returns array containing Twitter / X and YouTube', () => {
    const names = getSupportedPlatformNames();
    expect(names).toContain('Twitter / X');
    expect(names).toContain('YouTube');
  });

  it('returns exactly 2 entries', () => {
    expect(getSupportedPlatformNames()).toHaveLength(2);
  });
});

describe('getPlannedPlatformNames', () => {
  it('returns array containing Facebook and Threads', () => {
    const names = getPlannedPlatformNames();
    expect(names).toContain('Facebook');
    expect(names).toContain('Threads');
  });

  it('returns exactly 2 entries', () => {
    expect(getPlannedPlatformNames()).toHaveLength(2);
  });
});
