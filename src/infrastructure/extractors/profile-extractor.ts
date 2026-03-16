/**
 * Profile Extractor — abstract class for extracting KOL profile info + post URLs
 *
 * Separate hierarchy from SocialMediaExtractor:
 * - SocialMediaExtractor: extracts content from a single post URL
 * - ProfileExtractor: discovers post URLs from a profile/channel URL
 */

export type ContentType = 'long_video' | 'short' | 'live_stream';

export interface DiscoveredUrl {
  url: string;
  title?: string;
  publishedAt?: string;
  contentType?: ContentType;
  // Credit estimation fields (populated for YouTube URLs)
  captionAvailable?: boolean;
  durationSeconds?: number;
  estimatedCreditCost?: number;
}

export interface ProfileExtractResult {
  kolName: string;
  kolAvatarUrl: string | null;
  platformId: string;
  platformUrl: string;
  postUrls: string[];
  discoveredUrls?: DiscoveredUrl[];
}

export abstract class ProfileExtractor {
  abstract platform: string;

  /**
   * Check if the URL is a valid profile URL for this platform
   */
  abstract isValidProfileUrl(url: string): boolean;

  /**
   * Extract profile info and discover post URLs
   */
  abstract extractProfile(url: string): Promise<ProfileExtractResult>;
}
