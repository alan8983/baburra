/**
 * Social Media Content Extractor
 * Main entry point for the extractors module
 */

export type { UrlFetchResult, ExtractorConfig, ExtractorError } from './types';
export { SocialMediaExtractor } from './types';

export {
  extractorFactory,
  ExtractorFactory,
  facebookExtractor,
  twitterExtractor,
  threadsExtractor,
} from './factory';

export { FacebookExtractor } from './facebook.extractor';
export { TwitterExtractor } from './twitter.extractor';
export { ThreadsExtractor } from './threads.extractor';
