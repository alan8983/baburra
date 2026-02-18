/**
 * Facebook Content Extractor
 *
 * Extracts post content from Facebook URLs
 * Supports various Facebook URL formats:
 * - https://www.facebook.com/share/p/{id}/
 * - https://www.facebook.com/{username}/posts/{id}
 * - https://www.facebook.com/permalink.php?story_fbid={id}
 */

import { SocialMediaExtractor, UrlFetchResult, ExtractorConfig, ExtractorError } from './types';

export class FacebookExtractor extends SocialMediaExtractor {
  platform: UrlFetchResult['sourcePlatform'] = 'facebook';

  private readonly URL_PATTERNS = [
    /^https?:\/\/(www\.)?facebook\.com\/share\/p\/[\w-]+\/?/,
    /^https?:\/\/(www\.)?facebook\.com\/[\w.]+\/posts\/[\w-]+\/?/,
    /^https?:\/\/(www\.)?facebook\.com\/permalink\.php\?story_fbid=/,
    /^https?:\/\/(www\.)?facebook\.com\/[\w.]+\/videos\/[\w-]+\/?/,
    /^https?:\/\/(www\.)?facebook\.com\/photo\.php\?fbid=/,
  ];

  isValidUrl(url: string): boolean {
    return this.URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  async extract(url: string, config?: ExtractorConfig): Promise<UrlFetchResult> {
    if (!this.isValidUrl(url)) {
      throw {
        code: 'INVALID_URL',
        message: `Invalid Facebook URL: ${url}`,
      } as ExtractorError;
    }

    const timeout = config?.timeout || 10000;
    const retryAttempts = config?.retryAttempts || 3;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const result = await this.fetchWithTimeout(url, timeout, config);
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
      message: `Failed to fetch Facebook content after ${retryAttempts} attempts`,
      originalError: lastError,
    } as ExtractorError;
  }

  private async fetchWithTimeout(
    url: string,
    timeout: number,
    config?: ExtractorConfig
  ): Promise<UrlFetchResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: HeadersInit = {
        'User-Agent':
          config?.userAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      };

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return this.parseHtml(html, url);
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

  private parseHtml(html: string, sourceUrl: string): UrlFetchResult {
    try {
      let content = '';
      let title: string | null = null;
      let kolName: string | null = null;
      const kolAvatarUrl: string | null = null;
      let postedAt: string | null = null;
      const images: string[] = [];

      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd.articleBody) content = jsonLd.articleBody;
          if (jsonLd.headline) title = jsonLd.headline;
          if (jsonLd.author?.name) kolName = jsonLd.author.name;
          if (jsonLd.datePublished) postedAt = jsonLd.datePublished;
        } catch {
          // continue with other methods
        }
      }

      if (!content) {
        const ogDescription = html.match(/<meta property="og:description" content="([^"]+)"/);
        if (ogDescription) {
          content = this.decodeHtmlEntities(ogDescription[1]);
        }
      }

      if (!title) {
        const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
        if (ogTitle) title = this.decodeHtmlEntities(ogTitle[1]);
      }

      const ogImageMatches = html.matchAll(/<meta property="og:image" content="([^"]+)"/g);
      for (const match of ogImageMatches) {
        const imageUrl = this.decodeHtmlEntities(match[1]);
        if (imageUrl && !images.includes(imageUrl)) images.push(imageUrl);
      }

      if (!content) {
        const dataAdPreview = html.match(/data-ad-preview="([^"]+)"/);
        if (dataAdPreview) {
          content = this.decodeHtmlEntities(dataAdPreview[1]);
        }
      }

      if (!content) {
        const textPatterns = [
          /<div[^>]*class="[^"]*userContent[^"]*"[^>]*>([\s\S]*?)<\/div>/,
          /<div[^>]*data-testid="post_message"[^>]*>([\s\S]*?)<\/div>/,
          /<p[^>]*>([\s\S]*?)<\/p>/,
        ];
        for (const pattern of textPatterns) {
          const match = html.match(pattern);
          if (match) {
            content = this.stripHtmlTags(match[1]);
            if (content.length > 10) break;
          }
        }
      }

      if (!kolName) {
        const authorMatch = html.match(/<meta property="og:site_name" content="([^"]+)"/);
        if (authorMatch) kolName = this.decodeHtmlEntities(authorMatch[1]);
      }

      content = this.sanitizeText(content);
      this.validateContent(content);

      return {
        content,
        sourceUrl,
        sourcePlatform: 'facebook',
        title: title ? this.sanitizeText(title) : null,
        images: images.slice(0, 10),
        postedAt,
        kolName,
        kolAvatarUrl,
      };
    } catch (error) {
      if ((error as ExtractorError).code) throw error;
      throw {
        code: 'PARSE_FAILED',
        message: 'Failed to parse Facebook content',
        originalError: error as Error,
      } as ExtractorError;
    }
  }

  private stripHtmlTags(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ');
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
    };
    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const facebookExtractor = new FacebookExtractor();
