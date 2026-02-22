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
      throw {
        code: 'INVALID_URL',
        message: `Invalid YouTube URL: ${url}`,
      } as ExtractorError;
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

    throw {
      code: 'FETCH_FAILED',
      message: `Failed to fetch YouTube content after ${retryAttempts} attempts`,
      originalError: lastError,
    } as ExtractorError;
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
      throw {
        code: 'INVALID_URL',
        message: `Could not extract video ID from URL: ${url}`,
      } as ExtractorError;
    }

    // 1. Fetch oEmbed metadata
    const metadata = await this.fetchOEmbed(url, timeout);

    // 2. Fetch transcript
    let transcriptText: string;
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = transcript.map((segment) => segment.text).join(' ');
    } catch (error) {
      throw {
        code: 'FETCH_FAILED',
        message: `Transcript unavailable for video ${videoId}. This video may not have captions enabled.`,
        originalError: error as Error,
      } as ExtractorError;
    }

    // 3. Sanitize and validate
    let content = this.sanitizeText(transcriptText);
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
      postedAt: null,
      kolName: metadata.author_name || null,
      kolAvatarUrl: null,
    };
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const youtubeExtractor = new YouTubeExtractor();
