import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeEpisodeUrl, decodeEpisodeUrl, PodcastEpisodeExtractor } from '../podcast.extractor';

// Mock dependencies
vi.mock('@/infrastructure/repositories/transcript.repository', () => ({
  findTranscriptByUrl: vi.fn(),
  saveTranscript: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/infrastructure/api/deepgram.client', () => ({
  deepgramTranscribe: vi.fn(),
}));

import { findTranscriptByUrl } from '@/infrastructure/repositories/transcript.repository';
import { deepgramTranscribe } from '@/infrastructure/api/deepgram.client';

describe('encodeEpisodeUrl / decodeEpisodeUrl', () => {
  it('roundtrips feed URL and GUID', () => {
    const feedUrl = 'https://feeds.example.com/podcast.xml';
    const guid = 'episode-123-abc';

    const encoded = encodeEpisodeUrl(feedUrl, guid);
    expect(encoded).toMatch(/^podcast-rss:\/\//);

    const decoded = decodeEpisodeUrl(encoded);
    expect(decoded.feedUrl).toBe(feedUrl);
    expect(decoded.episodeGuid).toBe(guid);
  });

  it('handles special characters in GUID', () => {
    const feedUrl = 'https://feeds.example.com/feed.xml';
    const guid = 'tag:soundcloud,2024:tracks/123456';

    const encoded = encodeEpisodeUrl(feedUrl, guid);
    const decoded = decodeEpisodeUrl(encoded);

    expect(decoded.feedUrl).toBe(feedUrl);
    expect(decoded.episodeGuid).toBe(guid);
  });

  it('throws on non-podcast-rss URL', () => {
    expect(() => decodeEpisodeUrl('https://example.com')).toThrow('Not a podcast-rss:// URL');
  });

  it('throws on missing GUID fragment', () => {
    expect(() => decodeEpisodeUrl('podcast-rss://abc123')).toThrow('Missing episode GUID');
  });
});

describe('PodcastEpisodeExtractor', () => {
  const extractor = new PodcastEpisodeExtractor();

  describe('isValidUrl', () => {
    it('validates podcast-rss:// URLs', () => {
      expect(extractor.isValidUrl('podcast-rss://abc#guid')).toBe(true);
      expect(extractor.isValidUrl('https://example.com')).toBe(false);
    });
  });

  describe('extract', () => {
    const feedUrl = 'https://feeds.example.com/podcast.xml';
    const guid = 'ep-001';
    const encodedUrl = encodeEpisodeUrl(feedUrl, guid);

    const mockFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title>
    <item>
      <title>Episode 1: Markets Today</title>
      <guid>ep-001</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg"/>
      <itunes:duration>1800</itunes:duration>
      <podcast:transcript url="https://cdn.example.com/ep1.vtt" type="text/vtt"/>
    </item>
    <item>
      <title>Episode 2</title>
      <guid>ep-002</guid>
      <enclosure url="https://cdn.example.com/ep2.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

    beforeEach(() => {
      vi.restoreAllMocks();
      vi.mocked(findTranscriptByUrl).mockResolvedValue(null);
    });

    it('extracts transcript via Tier 1 (RSS transcript tag)', async () => {
      const vttContent = `WEBVTT

00:00:01.000 --> 00:00:05.000
Hello, welcome to the show about markets today.`;

      // First fetch: RSS feed, Second fetch: VTT file
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mockFeedXml),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(vttContent),
        } as Response);

      const result = await extractor.extract(encodedUrl);

      expect(result.content).toBe('Hello, welcome to the show about markets today.');
      expect(result.sourcePlatform).toBe('podcast');
      expect(result.title).toBe('Episode 1: Markets Today');
    });

    it('falls back to Tier 2 (cached transcript)', async () => {
      // Feed fetch succeeds but transcript fetch fails
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mockFeedXml),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response);

      vi.mocked(findTranscriptByUrl).mockResolvedValue({
        id: '1',
        sourceUrl: 'https://cdn.example.com/ep1.mp3',
        content: 'Cached transcript content here',
        source: 'caption',
        language: null,
        durationSeconds: null,
        createdAt: new Date(),
      });

      const result = await extractor.extract(encodedUrl);
      expect(result.content).toBe('Cached transcript content here');
    });

    it('falls back to Tier 3 (Deepgram transcription)', async () => {
      // Episode without transcript tag
      const noTranscriptGuid = 'ep-002';
      const noTranscriptUrl = encodeEpisodeUrl(feedUrl, noTranscriptGuid);

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mockFeedXml),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
        } as Response);

      vi.mocked(deepgramTranscribe).mockResolvedValue('Deepgram transcribed content');

      const result = await extractor.extract(noTranscriptUrl);
      expect(result.content).toBe('Deepgram transcribed content');
      expect(deepgramTranscribe).toHaveBeenCalled();
    });

    it('throws on duration exceeding 90 minutes', async () => {
      const longFeed = mockFeedXml.replace(
        '<itunes:duration>1800</itunes:duration>',
        '<itunes:duration>7200</itunes:duration>'
      );

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(longFeed),
      } as Response);

      await expect(extractor.extract(encodedUrl)).rejects.toThrow('exceeds maximum duration');
    });

    it('throws when episode GUID not found', async () => {
      const badUrl = encodeEpisodeUrl(feedUrl, 'nonexistent-guid');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockFeedXml),
      } as Response);

      await expect(extractor.extract(badUrl)).rejects.toThrow('Episode not found');
    });

    it('throws on invalid URL', async () => {
      await expect(extractor.extract('https://example.com')).rejects.toThrow(
        'Not a podcast-rss:// URL'
      );
    });
  });
});
