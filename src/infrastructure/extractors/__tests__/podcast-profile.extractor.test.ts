import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PodcastProfileExtractor, isInvestmentRelevant } from '../podcast-profile.extractor';

// Mock the RSS resolver
vi.mock('@/infrastructure/api/rss-resolver', () => ({
  resolveToRssFeed: vi.fn(),
  isSpotifyShowUrl: vi.fn((url: string) => /spotify\.com\/show\//.test(url)),
  isApplePodcastUrl: vi.fn((url: string) => /podcasts\.apple\.com\//.test(url)),
  isDirectRssUrl: vi.fn((url: string) => url.includes('feeds.') || url.endsWith('.xml')),
}));

import { resolveToRssFeed } from '@/infrastructure/api/rss-resolver';

const MOCK_RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>投資觀察 Investment Watch</title>
    <itunes:image href="https://example.com/cover.jpg"/>
    <link>https://example.com</link>
    <item>
      <title>EP50 台股投資策略</title>
      <guid>ep-050</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example.com/ep50.mp3" type="audio/mpeg"/>
      <itunes:duration>2700</itunes:duration>
      <podcast:transcript url="https://cdn.example.com/ep50.vtt" type="text/vtt"/>
    </item>
    <item>
      <title>EP49 美股財報分析</title>
      <guid>ep-049</guid>
      <pubDate>Sun, 31 Dec 2023 00:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example.com/ep49.mp3" type="audio/mpeg"/>
      <itunes:duration>45:30</itunes:duration>
    </item>
    <item>
      <title>EP48 年度回顧</title>
      <guid>ep-048</guid>
      <pubDate>Sat, 30 Dec 2023 00:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example.com/ep48.mp3" type="audio/mpeg"/>
      <itunes:duration>1:15:00</itunes:duration>
    </item>
  </channel>
</rss>`;

describe('PodcastProfileExtractor', () => {
  const extractor = new PodcastProfileExtractor();

  describe('isValidProfileUrl', () => {
    it('accepts Spotify show URLs', () => {
      expect(extractor.isValidProfileUrl('https://open.spotify.com/show/abc123')).toBe(true);
    });

    it('accepts Apple Podcast URLs', () => {
      expect(
        extractor.isValidProfileUrl('https://podcasts.apple.com/tw/podcast/example/id123')
      ).toBe(true);
    });

    it('accepts direct RSS URLs', () => {
      expect(extractor.isValidProfileUrl('https://feeds.example.com/podcast.xml')).toBe(true);
    });

    it('rejects non-podcast URLs', () => {
      expect(extractor.isValidProfileUrl('https://youtube.com/@channel')).toBe(false);
      expect(extractor.isValidProfileUrl('https://twitter.com/user')).toBe(false);
    });
  });

  describe('extractProfile', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('parses RSS feed and returns profile with discovered URLs', async () => {
      vi.mocked(resolveToRssFeed).mockResolvedValue('https://feeds.example.com/podcast.xml');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_RSS_FEED),
      } as Response);

      const result = await extractor.extractProfile('https://feeds.example.com/podcast.xml');

      expect(result.kolName).toBe('投資觀察 Investment Watch');
      expect(result.kolAvatarUrl).toBe('https://example.com/cover.jpg');
      expect(result.discoveredUrls).toHaveLength(3);
      expect(result.discoveredUrls![0].title).toBe('EP50 台股投資策略');
      expect(result.discoveredUrls![0].contentType).toBe('podcast_episode');
    });

    it('estimates credit cost based on transcript availability', async () => {
      vi.mocked(resolveToRssFeed).mockResolvedValue('https://feeds.example.com/podcast.xml');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_RSS_FEED),
      } as Response);

      const result = await extractor.extractProfile('https://feeds.example.com/podcast.xml');
      const urls = result.discoveredUrls!;

      // EP50 has transcript → recipe = scrape.rss + transcribe.cached_transcript + ai.analyze.short
      //   = 0.3 + 0.2 + 1.0 = 1.5 -> ceil -> 2
      expect(urls[0].captionAvailable).toBe(true);
      expect(urls[0].estimatedCreditCost).toBe(2);
      expect(urls[0].recipe).toEqual([
        { block: 'scrape.rss', units: 1 },
        { block: 'transcribe.cached_transcript', units: 1 },
        { block: 'ai.analyze.short', units: 1 },
      ]);

      // EP49 no transcript, 45:30 → 46 min
      //   recipe = scrape.rss + download.audio.long×46 + transcribe.audio×46 + ai.analyze.short
      //   = 0.3 + 4.6 + 69 + 1.0 = 74.9 -> 75
      expect(urls[1].captionAvailable).toBe(false);
      expect(urls[1].estimatedCreditCost).toBe(75);
      expect(urls[1].recipe).toEqual([
        { block: 'scrape.rss', units: 1 },
        { block: 'download.audio.long', units: 46 },
        { block: 'transcribe.audio', units: 46 },
        { block: 'ai.analyze.short', units: 1 },
      ]);

      // EP48 no transcript, 1:15:00 = 75 min
      //   = 0.3 + 7.5 + 112.5 + 1.0 = 121.3 -> 122
      expect(urls[2].captionAvailable).toBe(false);
      expect(urls[2].estimatedCreditCost).toBe(122);
    });

    it('parses various duration formats', async () => {
      vi.mocked(resolveToRssFeed).mockResolvedValue('https://feeds.example.com/podcast.xml');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_RSS_FEED),
      } as Response);

      const result = await extractor.extractProfile('https://feeds.example.com/podcast.xml');

      // 2700 seconds
      expect(result.discoveredUrls![0].durationSeconds).toBe(2700);
      // 45:30 = 2730 seconds
      expect(result.discoveredUrls![1].durationSeconds).toBe(2730);
      // 1:15:00 = 4500 seconds
      expect(result.discoveredUrls![2].durationSeconds).toBe(4500);
    });

    it('limits to 10 episodes by default', async () => {
      // Create feed with 15 items
      const items = Array.from(
        { length: 15 },
        (_, i) => `
        <item>
          <title>EP${i}</title>
          <guid>ep-${i}</guid>
          <enclosure url="https://cdn.example.com/ep${i}.mp3" type="audio/mpeg"/>
        </item>`
      ).join('');

      const largeFeed = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel><title>Test</title>${items}</channel>
</rss>`;

      vi.mocked(resolveToRssFeed).mockResolvedValue('https://feeds.example.com/feed.xml');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(largeFeed),
      } as Response);

      const result = await extractor.extractProfile('https://feeds.example.com/feed.xml');
      expect(result.discoveredUrls).toHaveLength(10);
    });
  });
});

describe('isInvestmentRelevant', () => {
  it('matches Chinese investment keywords', () => {
    expect(isInvestmentRelevant('台股投資策略分析')).toBe(true);
    expect(isInvestmentRelevant('美股財報季回顧')).toBe(true);
    expect(isInvestmentRelevant('比特幣走勢預測')).toBe(true);
  });

  it('matches English investment keywords', () => {
    expect(isInvestmentRelevant('Stock Market Analysis')).toBe(true);
    expect(isInvestmentRelevant('Bitcoin and Crypto Trends')).toBe(true);
    expect(isInvestmentRelevant('ETF Portfolio Strategy')).toBe(true);
  });

  it('rejects non-investment content', () => {
    expect(isInvestmentRelevant('My Cooking Adventure')).toBe(false);
    expect(isInvestmentRelevant('旅遊日記第五集')).toBe(false);
  });

  it('checks description as well', () => {
    expect(isInvestmentRelevant('Random Title', '本集討論台積電和NVIDIA的股票表現')).toBe(true);
  });
});
