/**
 * Social Media Extractor Factory
 *
 * Automatically routes URLs to the appropriate extractor
 */

import {
  SocialMediaExtractor,
  UrlFetchResult,
  ExtractorConfig,
  ExtractorError,
} from './types';
import { facebookExtractor } from './facebook.extractor';
import { twitterExtractor } from './twitter.extractor';
import { threadsExtractor } from './threads.extractor';

export class ExtractorFactory {
  private extractors: Map<string, SocialMediaExtractor> = new Map();

  constructor() {
    this.register(facebookExtractor);
    this.register(twitterExtractor);
    this.register(threadsExtractor);
  }

  register(extractor: SocialMediaExtractor): void {
    this.extractors.set(extractor.platform, extractor);
  }

  getExtractor(
    platform: UrlFetchResult['sourcePlatform']
  ): SocialMediaExtractor | undefined {
    return this.extractors.get(platform);
  }

  async extractFromUrl(
    url: string,
    config?: ExtractorConfig
  ): Promise<UrlFetchResult> {
    for (const extractor of this.extractors.values()) {
      if (extractor.isValidUrl(url)) {
        return await extractor.extract(url, config);
      }
    }

    throw {
      code: 'INVALID_URL',
      message: `No extractor found for URL: ${url}. Supported platforms: ${Array.from(this.extractors.keys()).join(', ')}`,
    } as ExtractorError;
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

export { facebookExtractor } from './facebook.extractor';
export { twitterExtractor } from './twitter.extractor';
export { threadsExtractor } from './threads.extractor';
