/**
 * Social Media Content Extractor
 * Main entry point for the extractors module
 */

export type { UrlFetchResult, ExtractorConfig, ExtractorError } from './types';
export { SocialMediaExtractor } from './types';

export { extractorFactory, ExtractorFactory, twitterExtractor, youtubeExtractor } from './factory';

export { TwitterExtractor } from './twitter.extractor';
export { YouTubeExtractor } from './youtube.extractor';
