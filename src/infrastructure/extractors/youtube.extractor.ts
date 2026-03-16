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
import { CREDIT_COSTS } from '@/domain/models/user';

export interface CaptionAvailabilityResult {
  hasCaptions: boolean;
  estimatedDurationSeconds: number | null;
  estimatedCreditCost: number;
}

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

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Shape of the YouTube Data API v3 videos.list response */
interface YouTubeVideosApiResponse {
  items?: Array<{
    snippet: {
      publishedAt: string;
    };
  }>;
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

  /**
   * Lightweight check for caption availability and estimated credit cost.
   * Used in the scrape discovery step to show per-URL cost estimates.
   */
  async checkCaptionAvailability(url: string): Promise<CaptionAvailabilityResult> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      return {
        hasCaptions: false,
        estimatedDurationSeconds: null,
        estimatedCreditCost: CREDIT_COSTS.youtube_caption_analysis,
      };
    }

    // Fetch page data for duration + try caption check in parallel
    const [pageData, hasCaptions] = await Promise.all([
      this.fetchPageData(videoId, 10000),
      this.checkCaptionsExist(videoId),
    ]);

    const durationSeconds = pageData.durationSeconds;

    let estimatedCreditCost: number;
    if (hasCaptions) {
      estimatedCreditCost = CREDIT_COSTS.youtube_caption_analysis;
    } else {
      // Gemini transcription cost: 7 credits per minute
      const minutes = Math.ceil((durationSeconds || 60) / 60);
      estimatedCreditCost = minutes * CREDIT_COSTS.video_transcription_per_min;
    }

    return {
      hasCaptions,
      estimatedDurationSeconds: durationSeconds,
      estimatedCreditCost,
    };
  }

  /**
   * Quick check if captions exist for a video without fetching them.
   */
  private async checkCaptionsExist(videoId: string): Promise<boolean> {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      return transcript.length > 0;
    } catch {
      return false;
    }
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

    const apiKey = process.env.YOUTUBE_DATA_API_KEY;

    // 1. Fetch oEmbed metadata + publish date + page HTML in parallel
    const [metadata, pageData, apiPublishDate] = await Promise.all([
      this.fetchOEmbed(url, timeout),
      this.fetchPageData(videoId, timeout),
      apiKey ? this.fetchPublishDate(videoId, apiKey, timeout) : Promise.resolve(null),
    ]);

    // 2. Fetch transcript — if unavailable, return content=null for Gemini transcription
    let content: string | null = null;
    let captionSource: 'caption' | 'none' = 'none';

    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      content = transcript.map((segment) => segment.text).join(' ');
      captionSource = 'caption';
    } catch (transcriptErr) {
      console.warn(
        `[YouTubeExtractor] Transcript unavailable for ${videoId}:`,
        transcriptErr instanceof Error ? transcriptErr.message : transcriptErr
      );
      // No description fallback — content stays null, will be handled by Gemini transcription
    }

    // 3. Sanitize and validate (only if content available)
    if (content !== null) {
      content = this.sanitizeText(content);
      if (content.length > 50000) {
        content = content.slice(0, 50000);
      }
      this.validateContent(content);
    }

    return {
      content,
      sourceUrl: url,
      sourcePlatform: 'youtube',
      title: metadata.title || null,
      images: metadata.thumbnail_url ? [metadata.thumbnail_url] : [],
      postedAt: apiPublishDate ?? pageData.publishDate,
      kolName: metadata.author_name || null,
      kolAvatarUrl: null,
      captionSource,
      durationSeconds: pageData.durationSeconds ?? undefined,
    };
  }

  /**
   * Fetch the YouTube video page HTML and extract publish date + description.
   * Description is used as fallback content when transcript is unavailable.
   */
  private async fetchPageData(
    videoId: string,
    timeout: number
  ): Promise<{
    publishDate: string | null;
    description: string | null;
    shortDescription: string | null;
    durationSeconds: number | null;
  }> {
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

      if (!response.ok)
        return {
          publishDate: null,
          description: null,
          shortDescription: null,
          durationSeconds: null,
        };

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

      // Extract meta description (truncated ~200 chars)
      let description: string | null = null;
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*?)"/);
      if (descMatch && descMatch[1]) {
        description = this.decodeHtmlEntities(descMatch[1]);
      }

      // Extract shortDescription from JSON-LD (full description, 1000+ chars)
      let shortDescription: string | null = null;
      const shortDescMatch = html.match(/"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (shortDescMatch && shortDescMatch[1]) {
        shortDescription = shortDescMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }

      // Extract video duration in seconds from page HTML
      let durationSeconds: number | null = null;
      const lengthMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
      if (lengthMatch) {
        durationSeconds = parseInt(lengthMatch[1], 10);
      }

      return { publishDate, description, shortDescription, durationSeconds };
    } catch (err) {
      console.warn(`[YouTubeExtractor] Failed to fetch page data for ${videoId}:`, err);
      return {
        publishDate: null,
        description: null,
        shortDescription: null,
        durationSeconds: null,
      };
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

  /**
   * Fetch the video's publish date via YouTube Data API v3.
   * Returns a full ISO 8601 timestamp (e.g. "2024-01-15T14:30:00Z") or null on failure.
   */
  private async fetchPublishDate(
    videoId: string,
    apiKey: string,
    timeout: number
  ): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const url = `${YOUTUBE_API_BASE}/videos?id=${encodeURIComponent(videoId)}&part=snippet&key=${apiKey}`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as YouTubeVideosApiResponse;
      return data.items?.[0]?.snippet?.publishedAt ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const youtubeExtractor = new YouTubeExtractor();
