/**
 * Podcast Profile Extractor
 *
 * Extracts show info and discovers episodes from podcast URLs.
 * Supports Spotify show URLs, Apple Podcast URLs, and direct RSS feed URLs.
 * Uses fast-xml-parser to parse RSS feeds and discover episodes.
 */

import { XMLParser } from 'fast-xml-parser';
import { ProfileExtractor, ProfileExtractResult, DiscoveredUrl } from './profile-extractor';
import {
  resolveToRssFeed,
  isSpotifyShowUrl,
  isApplePodcastUrl,
  isDirectRssUrl,
} from '@/infrastructure/api/rss-resolver';
import { CREDIT_COSTS } from '@/domain/models/user';
import { encodeEpisodeUrl } from './podcast.extractor';

/** Default number of recent episodes to discover */
const DEFAULT_EPISODE_LIMIT = 10;

/** Investment-related keywords for pre-filtering (Chinese + English) */
const INVESTMENT_KEYWORDS = [
  // Chinese
  '投資',
  '股票',
  '台股',
  '美股',
  '加密',
  '比特幣',
  '以太坊',
  'ETF',
  '基金',
  '債券',
  '利率',
  '通膨',
  '財報',
  '殖利率',
  '漲',
  '跌',
  '多頭',
  '空頭',
  '牛市',
  '熊市',
  '存股',
  '配息',
  '營收',
  '獲利',
  '經濟',
  '央行',
  '聯準會',
  // English
  'invest',
  'stock',
  'market',
  'crypto',
  'bitcoin',
  'ethereum',
  'etf',
  'bond',
  'rate',
  'inflation',
  'earnings',
  'yield',
  'bull',
  'bear',
  'portfolio',
  'dividend',
  'revenue',
  'profit',
  'economy',
  'fed',
  'nasdaq',
  's&p',
  'dow',
  'tsmc',
  'aapl',
  'nvda',
  'msft',
  'goog',
  'amzn',
  'tsla',
];

interface RssChannel {
  title?: string;
  'itunes:author'?: string;
  'itunes:image'?: { '@_href'?: string } | string;
  image?: { url?: string };
  link?: string;
  item?: RssItem | RssItem[];
}

interface RssItem {
  title?: string;
  guid?: string | { '#text'?: string };
  enclosure?: { '@_url'?: string; '@_type'?: string };
  pubDate?: string;
  'itunes:duration'?: string | number;
  'podcast:transcript'?: PodcastTranscript | PodcastTranscript[];
  description?: string;
  'itunes:summary'?: string;
}

interface PodcastTranscript {
  '@_url'?: string;
  '@_type'?: string;
}

export class PodcastProfileExtractor extends ProfileExtractor {
  platform = 'podcast';

  private readonly URL_PATTERNS = [
    /^https?:\/\/(open\.)?spotify\.com\/show\//,
    /^https?:\/\/podcasts\.apple\.com\//,
  ];

  isValidProfileUrl(url: string): boolean {
    return this.URL_PATTERNS.some((p) => p.test(url)) || isDirectRssUrl(url);
  }

  async extractProfile(url: string): Promise<ProfileExtractResult> {
    if (!this.isValidProfileUrl(url)) {
      throw new Error(`Invalid podcast URL: ${url}`);
    }

    // Resolve to RSS feed URL
    const feedUrl = await resolveToRssFeed(url);

    // Fetch and parse the RSS feed
    const feedResponse = await fetch(feedUrl);
    if (!feedResponse.ok) {
      throw new Error(
        `Failed to fetch RSS feed: ${feedResponse.status} ${feedResponse.statusText}`
      );
    }

    const feedXml = await feedResponse.text();
    const channel = this.parseFeed(feedXml);

    // Extract show metadata
    const kolName = channel.title ?? 'Unknown Podcast';
    const kolAvatarUrl = this.extractImageUrl(channel);

    // Extract episodes
    const items = this.normalizeItems(channel.item);
    const recentItems = items.slice(0, DEFAULT_EPISODE_LIMIT);

    // Build discovered URLs with metadata
    const discoveredUrls = this.buildDiscoveredUrls(recentItems, feedUrl);

    // Build post URLs (for backward compat)
    const postUrls = discoveredUrls.map((d) => d.url);

    return {
      kolName,
      kolAvatarUrl,
      platformId: feedUrl,
      platformUrl: this.getShowUrl(url, feedUrl),
      postUrls,
      discoveredUrls,
    };
  }

  private parseFeed(xml: string): RssChannel {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'item' || name === 'podcast:transcript',
    });

    const parsed = parser.parse(xml);
    const channel = parsed?.rss?.channel;
    if (!channel) {
      throw new Error('Invalid RSS feed: no <channel> element found');
    }
    return channel as RssChannel;
  }

  private normalizeItems(items: RssItem | RssItem[] | undefined): RssItem[] {
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  }

  private extractImageUrl(channel: RssChannel): string | null {
    // Try itunes:image (preferred, usually higher quality)
    const itunesImage = channel['itunes:image'];
    if (typeof itunesImage === 'object' && itunesImage?.['@_href']) {
      return itunesImage['@_href'];
    }
    if (typeof itunesImage === 'string') {
      return itunesImage;
    }
    // Fallback to standard RSS image
    if (channel.image?.url) {
      return channel.image.url;
    }
    return null;
  }

  private getShowUrl(originalUrl: string, feedUrl: string): string {
    // Return the original user-provided URL as the platform URL
    // (more user-friendly than the raw RSS feed URL)
    if (isSpotifyShowUrl(originalUrl) || isApplePodcastUrl(originalUrl)) {
      return originalUrl;
    }
    return feedUrl;
  }

  private buildDiscoveredUrls(items: RssItem[], feedUrl: string): DiscoveredUrl[] {
    const results: DiscoveredUrl[] = [];
    for (const item of items) {
      const guid = this.extractGuid(item);
      if (!guid) continue;

      const hasTranscript = this.hasTranscriptTag(item);
      const durationSeconds = this.parseDuration(item['itunes:duration']);
      const estimatedCreditCost = this.estimateCreditCost(hasTranscript, durationSeconds);

      results.push({
        url: encodeEpisodeUrl(feedUrl, guid),
        title: item.title,
        publishedAt: item.pubDate,
        contentType: 'podcast_episode',
        captionAvailable: hasTranscript,
        durationSeconds,
        estimatedCreditCost,
      });
    }
    return results;
  }

  private extractGuid(item: RssItem): string | null {
    if (!item.guid) return null;
    if (typeof item.guid === 'string') return item.guid;
    return item.guid['#text'] ?? null;
  }

  private hasTranscriptTag(item: RssItem): boolean {
    const transcripts = item['podcast:transcript'];
    if (!transcripts) return false;
    const arr = Array.isArray(transcripts) ? transcripts : [transcripts];
    return arr.some((t) => !!t['@_url']);
  }

  /** Parse itunes:duration which can be seconds (number) or HH:MM:SS / MM:SS string */
  private parseDuration(duration: string | number | undefined): number | undefined {
    if (duration === undefined || duration === null) return undefined;

    if (typeof duration === 'number') return duration;

    // Pure numeric string = seconds
    if (/^\d+$/.test(duration)) return parseInt(duration, 10);

    // HH:MM:SS or MM:SS
    const parts = duration.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];

    return undefined;
  }

  private estimateCreditCost(hasTranscript: boolean, durationSeconds?: number): number {
    if (hasTranscript) {
      return CREDIT_COSTS.podcast_transcript_analysis;
    }
    if (durationSeconds) {
      const minutes = Math.ceil(durationSeconds / 60);
      return minutes * CREDIT_COSTS.video_transcription_per_min;
    }
    // Unknown duration without transcript — estimate conservatively (30 min episode)
    return 30 * CREDIT_COSTS.video_transcription_per_min;
  }
}

/**
 * Check if episode title/description contains investment-related keywords.
 * Used for pre-filtering episodes during discovery.
 */
export function isInvestmentRelevant(title: string, description?: string): boolean {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  return INVESTMENT_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

export const podcastProfileExtractor = new PodcastProfileExtractor();
