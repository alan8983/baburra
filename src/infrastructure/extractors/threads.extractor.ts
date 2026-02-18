/**
 * Threads Content Extractor
 *
 * Extracts post content from Meta Threads URLs
 * Supports Threads URL formats:
 * - https://www.threads.net/@{username}/post/{id}
 * - https://threads.net/@{username}/post/{id}
 */

import { SocialMediaExtractor, UrlFetchResult, ExtractorConfig, ExtractorError } from './types';

export class ThreadsExtractor extends SocialMediaExtractor {
  platform: UrlFetchResult['sourcePlatform'] = 'threads';

  private readonly URL_PATTERNS = [/^https?:\/\/(www\.)?threads\.net\/@[\w.]+\/post\/[\w-]+/];

  isValidUrl(url: string): boolean {
    return this.URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  async extract(url: string, config?: ExtractorConfig): Promise<UrlFetchResult> {
    if (!this.isValidUrl(url)) {
      throw {
        code: 'INVALID_URL',
        message: `Invalid Threads URL: ${url}`,
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
      message: `Failed to fetch Threads content after ${retryAttempts} attempts`,
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
      const cleanUrl = url.split('?')[0];

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

      const response = await fetch(cleanUrl, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return this.parseHtml(html, cleanUrl);
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
      let kolAvatarUrl: string | null = null;
      let postedAt: string | null = null;
      const images: string[] = [];

      const urlMatch = sourceUrl.match(/@([\w.]+)\/post\//);
      const username = urlMatch ? urlMatch[1] : null;

      const ogDescription = html.match(/<meta property="og:description" content="([^"]+)"/);
      if (ogDescription) {
        content = this.decodeHtmlEntities(ogDescription[1]);
      }

      const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (ogTitle) {
        const titleText = this.decodeHtmlEntities(ogTitle[1]);
        const titleMatch = titleText.match(/^@([\w.]+) on Threads: (.+)/);
        if (titleMatch) {
          kolName = '@' + titleMatch[1];
          if (!content) content = titleMatch[2].trim();
        } else {
          title = titleText;
          const usernameMatch = titleText.match(/^@([\w.]+)/);
          if (usernameMatch && !kolName) kolName = '@' + usernameMatch[1];
        }
      }

      if (!kolName && username) kolName = '@' + username;

      const ogImageMatches = html.matchAll(/<meta property="og:image" content="([^"]+)"/g);
      for (const match of ogImageMatches) {
        const imageUrl = this.decodeHtmlEntities(match[1]);
        if (!images.includes(imageUrl)) images.push(imageUrl);
      }

      if (images.length > 0) {
        const firstImage = images[0];
        if (firstImage.includes('profile') || images.length === 1) {
          kolAvatarUrl = firstImage;
          images.shift();
        }
      }

      if (!content) {
        const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (jsonLdMatch) {
          try {
            const jsonLd = JSON.parse(jsonLdMatch[1]);
            if (jsonLd.articleBody) content = jsonLd.articleBody;
            if (jsonLd.headline && !title) title = jsonLd.headline;
            if (jsonLd.author?.name && !kolName) kolName = jsonLd.author.name;
            if (jsonLd.datePublished) postedAt = jsonLd.datePublished;
            if (jsonLd.image && Array.isArray(jsonLd.image)) {
              jsonLd.image.forEach((img: string) => {
                if (!images.includes(img)) images.push(img);
              });
            }
          } catch {
            // JSON parsing failed
          }
        }
      }

      if (!content) {
        const twitterDesc = html.match(/<meta name="twitter:description" content="([^"]+)"/);
        if (twitterDesc) {
          content = this.decodeHtmlEntities(twitterDesc[1]);
        }
      }

      if (!kolName) {
        const twitterTitle = html.match(/<meta name="twitter:title" content="([^"]+)"/);
        if (twitterTitle) {
          const titleText = this.decodeHtmlEntities(twitterTitle[1]);
          const usernameMatch = titleText.match(/^@([\w.]+)/);
          if (usernameMatch) kolName = '@' + usernameMatch[1];
        }
      }

      if (!kolAvatarUrl) {
        const twitterImage = html.match(/<meta name="twitter:image" content="([^"]+)"/);
        if (twitterImage) {
          const imageUrl = this.decodeHtmlEntities(twitterImage[1]);
          if (imageUrl.includes('profile') || imageUrl.includes('avatar')) {
            kolAvatarUrl = imageUrl;
          } else if (!images.includes(imageUrl)) {
            images.push(imageUrl);
          }
        }
      }

      if (!content) {
        const pageTitle = html.match(/<title>([^<]+)<\/title>/);
        if (pageTitle) {
          const titleText = this.decodeHtmlEntities(pageTitle[1]);
          const match = titleText.match(/on Threads: (.+)/);
          if (match) {
            content = match[1].replace(/\s*\|.*$/, '').trim();
          }
        }
      }

      if (!postedAt) {
        const publishedTime = html.match(
          /<meta property="article:published_time" content="([^"]+)"/
        );
        if (publishedTime) postedAt = publishedTime[1];
      }

      content = this.sanitizeText(content);
      content = content
        .replace(/^"|"$/g, '')
        .replace(/\s*\|\s*Threads\s*$/, '')
        .replace(/\s*-\s*@[\w.]+\s*$/, '');
      content = this.sanitizeText(content);

      this.validateContent(content);

      return {
        content,
        sourceUrl,
        sourcePlatform: 'threads',
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
        message: 'Failed to parse Threads content',
        originalError: error as Error,
      } as ExtractorError;
    }
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
    };
    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const threadsExtractor = new ThreadsExtractor();
