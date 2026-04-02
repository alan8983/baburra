/**
 * Social Media Content Extraction Types
 */

export interface UrlFetchResult {
  // Required fields
  content: string | null; // Plain text, 10-50,000 characters; null when captions unavailable (YouTube)
  sourceUrl: string; // Complete URL
  sourcePlatform:
    | 'twitter'
    | 'facebook'
    | 'threads'
    | 'instagram'
    | 'youtube'
    | 'youtube_short'
    | 'tiktok'
    | 'podcast'
    | 'manual';

  // Optional fields
  title: string | null;
  images: string[];
  postedAt: string | Date | null;
  kolName: string | null;
  kolAvatarUrl: string | null;

  // YouTube-specific fields
  captionSource?: 'caption' | 'none'; // Whether captions were available
  durationSeconds?: number; // Video duration in seconds
}

export interface ExtractorConfig {
  timeout?: number; // Request timeout in ms (default: 10000)
  userAgent?: string; // Custom user agent
  retryAttempts?: number; // Number of retry attempts (default: 3)
}

export type ExtractorErrorCode =
  | 'INVALID_URL'
  | 'FETCH_FAILED'
  | 'PARSE_FAILED'
  | 'CONTENT_TOO_SHORT'
  | 'CONTENT_TOO_LONG'
  | 'NETWORK_ERROR';

export class ExtractorError extends Error {
  code: ExtractorErrorCode;
  originalError?: Error;

  constructor(code: ExtractorErrorCode, message: string, originalError?: Error) {
    super(message);
    this.name = 'ExtractorError';
    this.code = code;
    this.originalError = originalError;
  }
}

export abstract class SocialMediaExtractor {
  abstract platform: UrlFetchResult['sourcePlatform'];

  /**
   * Validate if the URL belongs to this platform
   */
  abstract isValidUrl(url: string): boolean;

  /**
   * Extract content from the URL
   */
  abstract extract(url: string, config?: ExtractorConfig): Promise<UrlFetchResult>;

  /**
   * Validate content length (10-50,000 characters)
   */
  protected validateContent(content: string): void {
    if (content.length < 10) {
      throw new ExtractorError(
        'CONTENT_TOO_SHORT',
        `Content too short: ${content.length} characters (minimum 10)`
      );
    }
    if (content.length > 50000) {
      throw new ExtractorError(
        'CONTENT_TOO_LONG',
        `Content too long: ${content.length} characters (maximum 50,000)`
      );
    }
  }

  /**
   * Sanitize text content (remove extra whitespace, etc.)
   */
  protected sanitizeText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
  }
}
