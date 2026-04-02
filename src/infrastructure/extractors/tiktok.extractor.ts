/**
 * TikTok Single-Video Extractor
 *
 * Extracts content from a single TikTok video URL using Apify's TikTok scraper.
 * Returns the video description as content, along with author metadata and timestamps.
 *
 * Audio transcription is not included in this release because @distube/ytdl-core
 * does not support TikTok URLs. Transcription via yt-dlp can be added in a future iteration.
 */

import { SocialMediaExtractor, UrlFetchResult, ExtractorConfig, ExtractorError } from './types';
import { runActorSync } from '@/infrastructure/api/apify.client';

interface TikTokApifyResult {
  id: string;
  text: string; // video description
  createTime: number; // unix timestamp
  createTimeISO: string;
  authorMeta: {
    id: string;
    name: string; // display name
    nickName: string;
    avatar: string;
  };
  videoMeta?: {
    duration: number; // seconds
  };
  musicMeta?: {
    musicName: string;
    musicAuthor: string;
  };
  webVideoUrl?: string;
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
}

const TIKTOK_ACTOR_ID = 'apidojo/tiktok-scraper';

export class TikTokExtractor extends SocialMediaExtractor {
  platform: UrlFetchResult['sourcePlatform'] = 'tiktok';

  private readonly URL_PATTERNS = [
    /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
    /^https?:\/\/vm\.tiktok\.com\/[\w]+/,
    /^https?:\/\/(www\.)?tiktok\.com\/t\/[\w]+/,
  ];

  isValidUrl(url: string): boolean {
    return this.URL_PATTERNS.some((p) => p.test(url));
  }

  async extract(url: string, config?: ExtractorConfig): Promise<UrlFetchResult> {
    if (!this.isValidUrl(url)) {
      throw new ExtractorError('INVALID_URL', `Invalid TikTok URL: ${url}`);
    }

    const timeout = config?.timeout || 60_000;

    try {
      const items = await runActorSync<TikTokApifyResult>(
        TIKTOK_ACTOR_ID,
        { postURLs: [url] },
        timeout
      );

      if (!items.length) {
        throw new ExtractorError(
          'FETCH_FAILED',
          'TikTok scraper returned no results. The video may be deleted or private.'
        );
      }

      const item = items[0];
      const content = this.sanitizeText(item.text || '');

      if (content.length > 0) {
        this.validateContent(content);
      }

      const postedAt = item.createTimeISO
        ? item.createTimeISO
        : item.createTime
          ? new Date(item.createTime * 1000).toISOString()
          : null;

      return {
        content: content || null,
        sourceUrl: item.webVideoUrl || url,
        sourcePlatform: 'tiktok',
        title: null,
        images: [],
        postedAt,
        kolName: item.authorMeta?.name || item.authorMeta?.nickName || null,
        kolAvatarUrl: item.authorMeta?.avatar || null,
        durationSeconds: item.videoMeta?.duration,
      };
    } catch (error) {
      if (error instanceof ExtractorError) throw error;
      throw new ExtractorError(
        'FETCH_FAILED',
        `Failed to extract TikTok video: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

export const tiktokExtractor = new TikTokExtractor();
