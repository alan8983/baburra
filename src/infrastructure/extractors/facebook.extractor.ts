/**
 * Facebook Single-Post Extractor
 *
 * Extracts text content from a single Facebook post URL using Apify's
 * Facebook Posts Scraper. Text-only — no video transcription.
 *
 * Replaces the previous HTML-parsing approach which was unreliable due to
 * Facebook's aggressive anti-scraping measures.
 */

import { SocialMediaExtractor, UrlFetchResult, ExtractorConfig, ExtractorError } from './types';
import { runActorSync } from '@/infrastructure/api/apify.client';

interface FacebookApifyResult {
  postId: string;
  postUrl: string;
  postText: string;
  timestamp: string; // ISO 8601
  pageName: string;
  pageUrl?: string;
  likes?: number;
  comments?: number;
  shares?: number;
}

const FACEBOOK_ACTOR_ID = 'apify/facebook-posts-scraper';

export class FacebookExtractor extends SocialMediaExtractor {
  platform: UrlFetchResult['sourcePlatform'] = 'facebook';

  private readonly URL_PATTERNS = [
    /^https?:\/\/(www\.)?facebook\.com\/[\w.-]+\/posts\//,
    /^https?:\/\/(www\.)?facebook\.com\/permalink\.php\?story_fbid=/,
    /^https?:\/\/(www\.)?facebook\.com\/share\/p\//,
    /^https?:\/\/(m\.)?facebook\.com\/[\w.-]+\/posts\//,
    /^https?:\/\/(www\.)?facebook\.com\/[\w.]+\/videos\//,
    /^https?:\/\/(www\.)?facebook\.com\/photo/,
    /^https?:\/\/fb\.com\//,
  ];

  isValidUrl(url: string): boolean {
    return this.URL_PATTERNS.some((p) => p.test(url));
  }

  async extract(url: string, config?: ExtractorConfig): Promise<UrlFetchResult> {
    if (!this.isValidUrl(url)) {
      throw new ExtractorError('INVALID_URL', `Invalid Facebook URL: ${url}`);
    }

    const timeout = config?.timeout || 60_000;

    try {
      const items = await runActorSync<FacebookApifyResult>(
        FACEBOOK_ACTOR_ID,
        { startUrls: [{ url }], resultsLimit: 1 },
        timeout
      );

      if (!items.length) {
        throw new ExtractorError(
          'FETCH_FAILED',
          'Facebook scraper returned no results. The post may be deleted or private.'
        );
      }

      const item = items[0];
      const content = this.sanitizeText(item.postText || '');

      if (content.length > 0) {
        this.validateContent(content);
      }

      return {
        content: content || null,
        sourceUrl: item.postUrl || url,
        sourcePlatform: 'facebook',
        title: null,
        images: [],
        postedAt: item.timestamp || null,
        kolName: item.pageName || null,
        kolAvatarUrl: null,
      };
    } catch (error) {
      if (error instanceof ExtractorError) throw error;
      throw new ExtractorError(
        'FETCH_FAILED',
        `Failed to extract Facebook post: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

export const facebookExtractor = new FacebookExtractor();
