/**
 * TikTok Profile Extractor
 *
 * Discovers recent videos from a TikTok profile using Apify's TikTok scraper.
 * Returns DiscoveredUrl[] with contentType: 'short' for each video.
 */

import { ProfileExtractor } from './profile-extractor';
import type { ProfileExtractResult, DiscoveredUrl } from './profile-extractor';
import { runActor, waitForRun, getDatasetItems } from '@/infrastructure/api/apify.client';

interface TikTokProfileApifyResult {
  id: string;
  text: string;
  createTime: number;
  createTimeISO: string;
  webVideoUrl: string;
  authorMeta: {
    id: string;
    name: string;
    nickName: string;
    avatar: string;
  };
  videoMeta?: {
    duration: number;
  };
}

const TIKTOK_ACTOR_ID = 'apidojo/tiktok-scraper';

export class TikTokProfileExtractor extends ProfileExtractor {
  platform = 'tiktok';

  private readonly PROFILE_PATTERNS = [
    /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/?$/,
    /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/?\?.*$/,
  ];

  isValidProfileUrl(url: string): boolean {
    // Must be a profile URL, not a video URL
    if (/\/video\/\d+/.test(url)) return false;
    return this.PROFILE_PATTERNS.some((p) => p.test(url));
  }

  async extractProfile(url: string): Promise<ProfileExtractResult> {
    const username = this.parseUsername(url);
    if (!username) {
      throw new Error(`Cannot parse TikTok username from URL: ${url}`);
    }

    // Use async pattern for profile discovery (may take longer than 60s)
    const { runId, datasetId } = await runActor(TIKTOK_ACTOR_ID, {
      profiles: [username],
      resultsPerPage: 20,
    });

    await waitForRun(runId, 180_000); // 3 min timeout for profile discovery
    const items = await getDatasetItems<TikTokProfileApifyResult>(datasetId);

    if (!items.length) {
      throw new Error(`No videos found for TikTok profile: @${username}`);
    }

    const first = items[0];
    const postUrls = items.map((i) => i.webVideoUrl).filter(Boolean);
    const discoveredUrls: DiscoveredUrl[] = items
      .filter((i) => i.webVideoUrl)
      .map((i) => ({
        url: i.webVideoUrl,
        title: i.text ? i.text.slice(0, 100) : undefined,
        publishedAt: i.createTimeISO || new Date(i.createTime * 1000).toISOString(),
        contentType: 'short' as const,
        durationSeconds: i.videoMeta?.duration,
      }));

    return {
      kolName: first.authorMeta?.name || first.authorMeta?.nickName || username,
      kolAvatarUrl: first.authorMeta?.avatar || null,
      platformId: first.authorMeta?.id || username,
      platformUrl: `https://www.tiktok.com/@${username}`,
      postUrls,
      discoveredUrls,
    };
  }

  private parseUsername(url: string): string | null {
    const match = url.match(/tiktok\.com\/@([\w.-]+)/);
    return match ? match[1] : null;
  }
}

export const tiktokProfileExtractor = new TikTokProfileExtractor();
