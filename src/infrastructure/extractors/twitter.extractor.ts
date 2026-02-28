/**
 * Twitter/X Content Extractor
 *
 * Extracts post content from Twitter/X URLs using the free oEmbed API.
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
      throw {
        code: 'INVALID_URL',
        message: `Invalid Twitter/X URL: ${url}`,
      } as ExtractorError;
    }

    const timeout = config?.timeout || 10000;
    const retryAttempts = config?.retryAttempts || 3;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const result = await this.fetchOEmbed(url, timeout);
        return result;
      } catch (error) {
        lastError = error as Error;
        if (attempt < retryAttempts - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw {
      code: 'FETCH_FAILED',
      message: `Failed to fetch Twitter content after ${retryAttempts} attempts`,
      originalError: lastError,
    } as ExtractorError;
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
        throw {
          code: 'NETWORK_ERROR',
          message: `Request timeout after ${timeout}ms`,
          originalError: error,
        } as ExtractorError;
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
      if ((error as ExtractorError).code) throw error;
      throw {
        code: 'PARSE_FAILED',
        message: 'Failed to parse Twitter oEmbed response',
        originalError: error as Error,
      } as ExtractorError;
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
      const timestampMs = Number((tweetId >> 22n) + 1288834974657n);
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
