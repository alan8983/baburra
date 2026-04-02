/**
 * Social Media Extractor Factory
 *
 * Automatically routes URLs to the appropriate extractor.
 * Release 01: Only Twitter/X is supported (via free oEmbed API).
 * Facebook and Threads will be re-enabled in Release 02.
 */

import { SocialMediaExtractor, UrlFetchResult, ExtractorConfig, ExtractorError } from './types';
import { twitterExtractor } from './twitter.extractor';
import { youtubeExtractor } from './youtube.extractor';
import { podcastEpisodeExtractor } from './podcast.extractor';

export class ExtractorFactory {
  private extractors: Map<string, SocialMediaExtractor> = new Map();

  constructor() {
    this.register(twitterExtractor);
    this.register(youtubeExtractor);
    this.register(podcastEpisodeExtractor);
  }

  register(extractor: SocialMediaExtractor): void {
    this.extractors.set(extractor.platform, extractor);
  }

  getExtractor(platform: UrlFetchResult['sourcePlatform']): SocialMediaExtractor | undefined {
    return this.extractors.get(platform);
  }

  async extractFromUrl(url: string, config?: ExtractorConfig): Promise<UrlFetchResult> {
    for (const extractor of this.extractors.values()) {
      if (extractor.isValidUrl(url)) {
        return await extractor.extract(url, config);
      }
    }

    throw new ExtractorError(
      'INVALID_URL',
      `No extractor found for URL: ${url}. Supported platforms: ${Array.from(this.extractors.keys()).join(', ')}`
    );
  }

  getSupportedPlatforms(): string[] {
    return Array.from(this.extractors.keys());
  }

  isSupported(url: string): boolean {
    for (const extractor of this.extractors.values()) {
      if (extractor.isValidUrl(url)) return true;
    }
    return false;
  }
}

export const extractorFactory = new ExtractorFactory();

export { twitterExtractor } from './twitter.extractor';
export { youtubeExtractor } from './youtube.extractor';
export { podcastEpisodeExtractor } from './podcast.extractor';
