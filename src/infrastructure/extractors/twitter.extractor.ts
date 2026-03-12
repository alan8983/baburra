/**
 * Twitter/X Content Extractor
 *
 * Extracts post content from Twitter/X URLs using multiple strategies:
 * 1. oEmbed API (publish.twitter.com) — fast but increasingly unreliable
 * 2. Syndication API (syndication.twitter.com) — more reliable fallback
 *
 * Supports various Twitter/X URL formats:
 * - https://twitter.com/{username}/status/{id}
 * - https://x.com/{username}/status/{id}
 * - https://mobile.twitter.com/{username}/status/{id}
 */

import { SocialMediaExtractor, UrlFetchResult, ExtractorConfig, ExtractorError } from './types';

/** Shape of the Twitter oEmbed API JSON response */
interface TwitterOEmbedResponse {
  url: string;
  author_name: string;
  author_url: string;
  html: string;
  width: number;
  type: string;
  provider_name: string;
  version: string;
}

/** Shape of the Twitter Syndication API response */
interface TwitterSyndicationResponse {
  text: string;
  user: {
    name: string;
    screen_name: string;
    profile_image_url_https?: string;
  };
  created_at: string;
  id_str: string;
  mediaDetails?: Array<{
    media_url_https: string;
    type: string;
  }>;
}

export class TwitterExtractor extends SocialMediaExtractor {
  platform: UrlFetchResult['sourcePlatform'] = 'twitter';

  private readonly URL_PATTERNS = [
    /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]+\/status\/[\d]+/,
    /^https?:\/\/mobile\.(twitter|x)\.com\/[\w]+\/status\/[\d]+/,
  ];

  isValidUrl(url: string): boolean {
    return this.URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  async extract(url: string, config?: ExtractorConfig): Promise<UrlFetchResult> {
    if (!this.isValidUrl(url)) {
      throw new ExtractorError('INVALID_URL', `Invalid Twitter/X URL: ${url}`);
    }

    const timeout = config?.timeout || 10000;

    // Strategy 1: Try oEmbed API (fast path)
    try {
      return await this.fetchOEmbed(url, timeout);
    } catch {
      // oEmbed failed — try syndication fallback
    }

    // Strategy 2: Try Syndication API (more reliable)
    const tweetId = this.extractTweetId(url);
    if (tweetId) {
      try {
        return await this.fetchSyndication(tweetId, url, timeout);
      } catch {
        // Syndication also failed
      }
    }

    throw new ExtractorError(
      'FETCH_FAILED',
      `Failed to fetch Twitter content. The tweet may be deleted, private, or the API is unavailable.`
    );
  }

  private async fetchOEmbed(url: string, timeout: number): Promise<UrlFetchResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;

      const response = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`oEmbed API HTTP ${response.status}: ${response.statusText}`);
      }

      const data: TwitterOEmbedResponse = await response.json();
      return this.parseOEmbedResponse(data, url);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExtractorError('NETWORK_ERROR', `Request timeout after ${timeout}ms`, error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private extractTweetId(url: string): string | null {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Fallback: Fetch tweet data via the syndication API.
   * This endpoint is more reliable than oEmbed for many tweets.
   */
  private async fetchSyndication(
    tweetId: string,
    originalUrl: string,
    timeout: number
  ): Promise<UrlFetchResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=0`;

      const response = await fetch(syndicationUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Syndication API HTTP ${response.status}`);
      }

      const data: TwitterSyndicationResponse = await response.json();

      let content = data.text || '';
      // Remove t.co links
      content = content.replace(/https?:\/\/t\.co\/\w+/g, '').trim();
      content = this.sanitizeText(content);
      this.validateContent(content);

      const postedAt = data.created_at ? new Date(data.created_at) : null;
      const images = (data.mediaDetails || [])
        .filter((m) => m.type === 'photo')
        .map((m) => m.media_url_https);

      return {
        content,
        sourceUrl: originalUrl,
        sourcePlatform: 'twitter',
        title: null,
        images,
        postedAt: postedAt && !isNaN(postedAt.getTime()) ? postedAt.toISOString() : null,
        kolName: data.user?.name || null,
        kolAvatarUrl: data.user?.profile_image_url_https || null,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExtractorError(
          'NETWORK_ERROR',
          `Syndication request timeout after ${timeout}ms`,
          error
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseOEmbedResponse(data: TwitterOEmbedResponse, originalUrl: string): UrlFetchResult {
    try {
      let content = this.extractTextFromHtml(data.html);

      // Sanitize each paragraph individually to preserve paragraph breaks
      content = content
        .split('\n\n')
        .map((p) => this.sanitizeText(p))
        .filter((p) => p.length > 0)
        .join('\n\n');
      content = content
        .replace(/\s+pic\.twitter\.com\/\w+/g, '')
        .replace(/\s+https?:\/\/t\.co\/\w+/g, '');
      content = content
        .split('\n\n')
        .map((p) => this.sanitizeText(p))
        .filter((p) => p.length > 0)
        .join('\n\n');

      this.validateContent(content);

      const postedAt = this.extractTimestampFromUrl(originalUrl);

      return {
        content,
        sourceUrl: data.url || originalUrl,
        sourcePlatform: 'twitter',
        title: null,
        images: [],
        postedAt: postedAt ? postedAt.toISOString() : null,
        kolName: data.author_name || null,
        kolAvatarUrl: null,
      };
    } catch (error) {
      if (error instanceof ExtractorError) throw error;
      throw new ExtractorError(
        'PARSE_FAILED',
        'Failed to parse Twitter oEmbed response',
        error as Error
      );
    }
  }

  /**
   * Extract tweet creation timestamp from the tweet ID using Twitter's snowflake algorithm.
   * Twitter IDs encode the timestamp: (id >> 22) + 1288834974657 = epoch ms.
   */
  private extractTimestampFromUrl(url: string): Date | null {
    const match = url.match(/\/status\/(\d+)/);
    if (!match) return null;

    try {
      const tweetId = BigInt(match[1]);
      const timestampMs = Number((tweetId >> BigInt(22)) + BigInt(1288834974657));
      const date = new Date(timestampMs);
      if (isNaN(date.getTime())) return null;
      return date;
    } catch {
      return null;
    }
  }

  private extractTextFromHtml(html: string): string {
    // Extract content from all <p> tags inside the blockquote
    const pMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
    if (pMatches.length === 0) {
      // Fallback: strip all tags from the full HTML
      return this.decodeHtmlEntities(this.stripHtmlTags(html));
    }

    const paragraphs = pMatches.map((m) => {
      let text = m[1];
      text = this.stripHtmlTags(text);
      text = this.decodeHtmlEntities(text);
      return text;
    });

    return paragraphs.join('\n\n');
  }

  private stripHtmlTags(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHtmlEntities(text: string): string {
    const entities: { [key: string]: string } = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&nbsp;': ' ',
      '&mdash;': '—',
    };
    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const twitterExtractor = new TwitterExtractor();
