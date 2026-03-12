/**
 * YouTube Content Extractor
 *
 * Extracts video content from YouTube URLs using the free oEmbed API for metadata
 * and the youtube-transcript package for transcript/caption text.
 * Supports various YouTube URL formats:
 * - https://www.youtube.com/watch?v={id}
 * - https://youtu.be/{id}
 * - https://m.youtube.com/watch?v={id}
 */

import { SocialMediaExtractor, UrlFetchResult, ExtractorConfig, ExtractorError } from './types';
import { YoutubeTranscript } from 'youtube-transcript-plus';

/** Shape of the YouTube oEmbed API JSON response */
interface YouTubeOEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  type: string;
  provider_name: string;
  version: string;
  html: string;
  width: number;
  height: number;
}

export class YouTubeExtractor extends SocialMediaExtractor {
  platform: UrlFetchResult['sourcePlatform'] = 'youtube';

  private readonly URL_PATTERNS = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/m\.youtube\.com\/watch\?v=[\w-]+/,
  ];

  isValidUrl(url: string): boolean {
    return this.URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  async extract(url: string, config?: ExtractorConfig): Promise<UrlFetchResult> {
    if (!this.isValidUrl(url)) {
      throw new ExtractorError('INVALID_URL', `Invalid YouTube URL: ${url}`);
    }

    const timeout = config?.timeout || 10000;
    const retryAttempts = config?.retryAttempts || 3;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const result = await this.fetchContent(url, timeout);
        return result;
      } catch (error) {
        lastError = error as Error;
        if (attempt < retryAttempts - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw new ExtractorError(
      'FETCH_FAILED',
      `Failed to fetch YouTube content after ${retryAttempts} attempts`,
      lastError
    );
  }

  private extractVideoId(url: string): string | null {
    // youtu.be/{id}
    const shortMatch = url.match(/youtu\.be\/([\w-]+)/);
    if (shortMatch) return shortMatch[1];

    // youtube.com/watch?v={id} or m.youtube.com/watch?v={id}
    const longMatch = url.match(/[?&]v=([\w-]+)/);
    if (longMatch) return longMatch[1];

    return null;
  }

  private async fetchContent(url: string, timeout: number): Promise<UrlFetchResult> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new ExtractorError('INVALID_URL', `Could not extract video ID from URL: ${url}`);
    }

    // 1. Fetch oEmbed metadata + publish date + page HTML in parallel
    const [metadata, pageData] = await Promise.all([
      this.fetchOEmbed(url, timeout),
      this.fetchPageData(videoId, timeout),
    ]);

    // 2. Fetch transcript (with fallback to description)
    let content: string;
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      content = transcript.map((segment) => segment.text).join(' ');
    } catch {
      // Fallback: use video title + description when transcript is unavailable
      const fallbackParts: string[] = [];
      if (metadata.title) fallbackParts.push(metadata.title);
      if (pageData.description) fallbackParts.push(pageData.description);

      if (fallbackParts.length === 0) {
        throw new ExtractorError(
          'FETCH_FAILED',
          `No transcript or description available for video ${videoId}.`
        );
      }

      content = fallbackParts.join('\n\n');
    }

    // 3. Sanitize and validate
    content = this.sanitizeText(content);
    if (content.length > 10000) {
      content = content.slice(0, 10000);
    }
    this.validateContent(content);

    return {
      content,
      sourceUrl: url,
      sourcePlatform: 'youtube',
      title: metadata.title || null,
      images: metadata.thumbnail_url ? [metadata.thumbnail_url] : [],
      postedAt: pageData.publishDate,
      kolName: metadata.author_name || null,
      kolAvatarUrl: null,
    };
  }

  /**
   * Fetch the YouTube video page HTML and extract publish date + description.
   * Description is used as fallback content when transcript is unavailable.
   */
  private async fetchPageData(
    videoId: string,
    timeout: number
  ): Promise<{ publishDate: string | null; description: string | null }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html',
        },
      });

      if (!response.ok) return { publishDate: null, description: null };

      const html = await response.text();

      // Extract publish date
      let publishDate: string | null = null;
      const metaMatch = html.match(/<meta\s+itemprop="datePublished"\s+content="([^"]+)"/);
      if (metaMatch) {
        publishDate = metaMatch[1];
      } else {
        const jsonLdMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
        if (jsonLdMatch) {
          publishDate = jsonLdMatch[1];
        } else {
          const uploadMatch = html.match(/"uploadDate"\s*:\s*"([^"]+)"/);
          if (uploadMatch) publishDate = uploadMatch[1];
        }
      }

      // Extract description (for fallback when transcript unavailable)
      let description: string | null = null;
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*?)"/);
      if (descMatch && descMatch[1]) {
        description = this.decodeHtmlEntities(descMatch[1]);
      }
      if (!description) {
        const shortDescMatch = html.match(/"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (shortDescMatch && shortDescMatch[1]) {
          description = shortDescMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }

      return { publishDate, description };
    } catch {
      return { publishDate: null, description: null };
    } finally {
      clearTimeout(timeoutId);
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
      '&nbsp;': ' ',
    };
    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }

  private async fetchOEmbed(url: string, timeout: number): Promise<YouTubeOEmbedResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

      const response = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`YouTube oEmbed API HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as YouTubeOEmbedResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExtractorError('NETWORK_ERROR', `Request timeout after ${timeout}ms`, error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const youtubeExtractor = new YouTubeExtractor();
