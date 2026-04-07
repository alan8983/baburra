import { describe, it, expect } from 'vitest';
import { detectProfilePlatform, isDirectRssUrl } from '../detect-profile-platform';

describe('detectProfilePlatform', () => {
  it('detects YouTube profiles (@handle, /channel/, /c/)', () => {
    expect(detectProfilePlatform('https://youtube.com/@somehandle')).toBe('youtube');
    expect(detectProfilePlatform('https://www.youtube.com/channel/UC1234567')).toBe('youtube');
    expect(detectProfilePlatform('https://youtube.com/c/SomeChannel')).toBe('youtube');
  });

  it('detects Twitter/X profiles', () => {
    expect(detectProfilePlatform('https://x.com/elonmusk')).toBe('twitter');
    expect(detectProfilePlatform('https://twitter.com/jack/')).toBe('twitter');
  });

  it('detects TikTok profiles', () => {
    expect(detectProfilePlatform('https://www.tiktok.com/@charlidamelio')).toBe('tiktok');
  });

  it('detects Facebook profiles', () => {
    expect(detectProfilePlatform('https://facebook.com/somepage')).toBe('facebook');
  });

  it('detects podcast URLs (Spotify show, Apple Podcasts, direct RSS)', () => {
    expect(detectProfilePlatform('https://open.spotify.com/show/abc123')).toBe('podcast');
    expect(detectProfilePlatform('https://podcasts.apple.com/us/podcast/name/id123')).toBe(
      'podcast'
    );
    expect(detectProfilePlatform('https://feeds.transistor.fm/acquired')).toBe('podcast');
    expect(detectProfilePlatform('https://example.com/feed.xml')).toBe('podcast');
  });

  it('returns null for post URLs (not profile URLs)', () => {
    expect(detectProfilePlatform('https://youtube.com/watch?v=abc123')).toBeNull();
    expect(detectProfilePlatform('https://x.com/elonmusk/status/123456')).toBeNull();
    expect(detectProfilePlatform('https://www.tiktok.com/@user/video/123')).toBeNull();
    expect(detectProfilePlatform('https://facebook.com/user/posts/123')).toBeNull();
  });

  it('returns null for empty or invalid inputs', () => {
    expect(detectProfilePlatform('')).toBeNull();
    expect(detectProfilePlatform('   ')).toBeNull();
    expect(detectProfilePlatform('not a url')).toBeNull();
    expect(detectProfilePlatform('https://example.com/')).toBeNull();
  });
});

describe('isDirectRssUrl', () => {
  it('recognizes RSS/Atom file extensions and feed paths', () => {
    expect(isDirectRssUrl('https://example.com/feed.xml')).toBe(true);
    expect(isDirectRssUrl('https://example.com/podcast.rss')).toBe(true);
    expect(isDirectRssUrl('https://example.com/feed/')).toBe(true);
    expect(isDirectRssUrl('https://feeds.example.com/show')).toBe(true);
    expect(isDirectRssUrl('https://anchor.fm/s/abc/podcast/rss')).toBe(true);
  });

  it('returns false for non-feed URLs', () => {
    expect(isDirectRssUrl('https://example.com/')).toBe(false);
    expect(isDirectRssUrl('not a url')).toBe(false);
  });
});
