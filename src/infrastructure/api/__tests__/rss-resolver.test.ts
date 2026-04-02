import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveSpotifyToRss,
  resolveAppleToRss,
  resolveToRssFeed,
  searchItunesPodcasts,
  isDirectRssUrl,
  isSpotifyShowUrl,
  isApplePodcastUrl,
} from '../rss-resolver';

describe('isSpotifyShowUrl', () => {
  it('matches Spotify show URLs', () => {
    expect(isSpotifyShowUrl('https://open.spotify.com/show/abc123')).toBe(true);
    expect(isSpotifyShowUrl('https://spotify.com/show/abc123')).toBe(true);
  });

  it('rejects non-Spotify URLs', () => {
    expect(isSpotifyShowUrl('https://open.spotify.com/track/abc')).toBe(false);
    expect(isSpotifyShowUrl('https://example.com/show/abc')).toBe(false);
  });
});

describe('isApplePodcastUrl', () => {
  it('matches Apple Podcast URLs', () => {
    expect(isApplePodcastUrl('https://podcasts.apple.com/us/podcast/example/id123456')).toBe(true);
    expect(isApplePodcastUrl('https://podcasts.apple.com/tw/podcast/example/id789')).toBe(true);
  });

  it('rejects non-Apple URLs', () => {
    expect(isApplePodcastUrl('https://music.apple.com/us/album/xyz')).toBe(false);
  });
});

describe('isDirectRssUrl', () => {
  it('matches RSS feed patterns', () => {
    expect(isDirectRssUrl('https://example.com/feed.xml')).toBe(true);
    expect(isDirectRssUrl('https://example.com/podcast.rss')).toBe(true);
    expect(isDirectRssUrl('https://feeds.example.com/podcast')).toBe(true);
    expect(isDirectRssUrl('https://example.com/feed/podcast')).toBe(true);
    expect(isDirectRssUrl('https://anchor.fm/s/abc/podcast/rss')).toBe(true);
  });

  it('rejects non-RSS URLs', () => {
    expect(isDirectRssUrl('https://example.com/page')).toBe(false);
    expect(isDirectRssUrl('https://youtube.com/watch?v=abc')).toBe(false);
  });

  it('handles invalid URLs gracefully', () => {
    expect(isDirectRssUrl('not a url')).toBe(false);
  });
});

describe('searchItunesPodcasts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed results from iTunes Search API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resultCount: 1,
          results: [
            { feedUrl: 'https://feeds.example.com/show.xml', trackId: 123, trackName: 'Test Show' },
          ],
        }),
    } as Response);

    const results = await searchItunesPodcasts('test');
    expect(results).toHaveLength(1);
    expect(results[0].feedUrl).toBe('https://feeds.example.com/show.xml');
  });

  it('filters out results without feedUrl', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resultCount: 2,
          results: [
            { trackId: 1, trackName: 'No Feed' },
            { feedUrl: 'https://feeds.example.com/show.xml', trackId: 2, trackName: 'Has Feed' },
          ],
        }),
    } as Response);

    const results = await searchItunesPodcasts('test');
    expect(results).toHaveLength(1);
    expect(results[0].trackName).toBe('Has Feed');
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    await expect(searchItunesPodcasts('test')).rejects.toThrow('iTunes Search API failed');
  });
});

describe('resolveSpotifyToRss', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves via oEmbed + iTunes Search', async () => {
    vi.spyOn(globalThis, 'fetch')
      // First call: Spotify oEmbed
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ title: '股癌 Gooaye' }),
      } as Response)
      // Second call: iTunes Search
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            resultCount: 1,
            results: [
              {
                feedUrl: 'https://feeds.example.com/gooaye.xml',
                trackId: 123,
                trackName: '股癌',
              },
            ],
          }),
      } as Response);

    const result = await resolveSpotifyToRss('https://open.spotify.com/show/abc123');
    expect(result).toBe('https://feeds.example.com/gooaye.xml');
  });

  it('throws when oEmbed fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    await expect(resolveSpotifyToRss('https://open.spotify.com/show/bad')).rejects.toThrow(
      'Spotify oEmbed failed'
    );
  });

  it('throws when iTunes returns no results', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ title: 'Unknown Show' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ resultCount: 0, results: [] }),
      } as Response);

    await expect(resolveSpotifyToRss('https://open.spotify.com/show/abc')).rejects.toThrow(
      'No podcast found in iTunes'
    );
  });
});

describe('resolveAppleToRss', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves via iTunes Lookup API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resultCount: 1,
          results: [{ feedUrl: 'https://example.com/podcast.xml' }],
        }),
    } as Response);

    const result = await resolveAppleToRss(
      'https://podcasts.apple.com/us/podcast/example/id1234567890'
    );
    expect(result).toBe('https://example.com/podcast.xml');
  });

  it('throws when no ID in URL', async () => {
    await expect(
      resolveAppleToRss('https://podcasts.apple.com/us/podcast/example')
    ).rejects.toThrow('Could not extract podcast ID');
  });

  it('throws when iTunes returns no results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ resultCount: 0, results: [] }),
    } as Response);

    await expect(
      resolveAppleToRss('https://podcasts.apple.com/us/podcast/example/id999')
    ).rejects.toThrow('No feed URL found');
  });
});

describe('resolveToRssFeed', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('routes Spotify URLs to resolveSpotifyToRss', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ title: 'Test Show' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            resultCount: 1,
            results: [
              { feedUrl: 'https://feed.example.com/test.xml', trackId: 1, trackName: 'Test' },
            ],
          }),
      } as Response);

    const result = await resolveToRssFeed('https://open.spotify.com/show/abc');
    expect(result).toBe('https://feed.example.com/test.xml');
  });

  it('routes Apple URLs to resolveAppleToRss', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          resultCount: 1,
          results: [{ feedUrl: 'https://feed.example.com/apple.xml' }],
        }),
    } as Response);

    const result = await resolveToRssFeed(
      'https://podcasts.apple.com/us/podcast/test/id1234567890'
    );
    expect(result).toBe('https://feed.example.com/apple.xml');
  });

  it('passes through direct RSS URLs', async () => {
    const result = await resolveToRssFeed('https://feeds.example.com/podcast.xml');
    expect(result).toBe('https://feeds.example.com/podcast.xml');
  });

  it('throws for unsupported URLs', async () => {
    await expect(resolveToRssFeed('https://example.com/page')).rejects.toThrow(
      'Unsupported podcast URL format'
    );
  });
});
