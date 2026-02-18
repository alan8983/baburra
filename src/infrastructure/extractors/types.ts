/**
 * Social Media Content Extraction Types
 */

export interface UrlFetchResult {
  // Required fields
  content: string; // Plain text, 10-10,000 characters
  sourceUrl: string; // Complete URL
  sourcePlatform: 'twitter' | 'facebook' | 'threads' | 'instagram' | 'manual';

  // Optional fields
  title: string | null;
  images: string[];
  postedAt: string | Date | null;
  kolName: string | null;
  kolAvatarUrl: string | null;
}

export interface ExtractorConfig {
  timeout?: number; // Request timeout in ms (default: 10000)
  userAgent?: string; // Custom user agent
  retryAttempts?: number; // Number of retry attempts (default: 3)
}

export interface ExtractorError {
  code:
    | 'INVALID_URL'
    | 'FETCH_FAILED'
    | 'PARSE_FAILED'
    | 'CONTENT_TOO_SHORT'
    | 'CONTENT_TOO_LONG'
    | 'NETWORK_ERROR';
  message: string;
  originalError?: Error;
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
   * Validate content length (10-10,000 characters)
   */
  protected validateContent(content: string): void {
    if (content.length < 10) {
      throw {
        code: 'CONTENT_TOO_SHORT',
        message: `Content too short: ${content.length} characters (minimum 10)`,
      } as ExtractorError;
    }
    if (content.length > 10000) {
      throw {
        code: 'CONTENT_TOO_LONG',
        message: `Content too long: ${content.length} characters (maximum 10,000)`,
      } as ExtractorError;
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
