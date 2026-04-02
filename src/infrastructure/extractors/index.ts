/**
 * Social Media Content Extractor
 * Main entry point for the extractors module
 */

export type { UrlFetchResult, ExtractorConfig, ExtractorErrorCode } from './types';
export { SocialMediaExtractor, ExtractorError } from './types';

export {
  extractorFactory,
  ExtractorFactory,
  twitterExtractor,
  youtubeExtractor,
  tiktokExtractor,
  facebookExtractor,
} from './factory';

export { TwitterExtractor } from './twitter.extractor';
export { YouTubeExtractor } from './youtube.extractor';
export { TikTokExtractor } from './tiktok.extractor';
export { FacebookExtractor } from './facebook.extractor';

export type { ProfileExtractResult, DiscoveredUrl, ContentType } from './profile-extractor';
export { ProfileExtractor } from './profile-extractor';
export { YouTubeChannelExtractor, youtubeChannelExtractor } from './youtube-channel.extractor';
export { TwitterProfileExtractor, twitterProfileExtractor } from './twitter-profile.extractor';
export { TikTokProfileExtractor, tiktokProfileExtractor } from './tiktok-profile.extractor';
export { FacebookProfileExtractor, facebookProfileExtractor } from './facebook-profile.extractor';
