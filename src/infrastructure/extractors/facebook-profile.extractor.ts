/**
 * Facebook Profile Extractor
 *
 * Discovers recent posts from a Facebook page/profile using Apify's
 * Facebook Posts Scraper. Returns DiscoveredUrl[] with contentType: 'text_post'.
 */

import { ProfileExtractor } from './profile-extractor';
import type { ProfileExtractResult, DiscoveredUrl } from './profile-extractor';
import { runActor, waitForRun, getDatasetItems } from '@/infrastructure/api/apify.client';

interface FacebookProfileApifyResult {
  postId: string;
  postUrl: string;
  postText: string;
  timestamp: string;
  pageName: string;
  pageId?: string;
  pageUrl?: string;
}

const FACEBOOK_ACTOR_ID = 'apify/facebook-posts-scraper';

export class FacebookProfileExtractor extends ProfileExtractor {
  platform = 'facebook';

  private readonly PROFILE_PATTERNS = [
    /^https?:\/\/(www\.)?facebook\.com\/[\w.-]+\/?$/,
    /^https?:\/\/(www\.)?facebook\.com\/[\w.-]+\/?\?.*$/,
  ];

  // Post-level URL patterns to exclude from profile matching
  private readonly POST_EXCLUSIONS = [
    /\/posts\//,
    /\/permalink\.php/,
    /\/share\//,
    /\/videos\//,
    /\/photo/,
    /\/events\//,
    /\/groups\//,
  ];

  isValidProfileUrl(url: string): boolean {
    if (this.POST_EXCLUSIONS.some((p) => p.test(url))) return false;
    return this.PROFILE_PATTERNS.some((p) => p.test(url));
  }

  async extractProfile(url: string): Promise<ProfileExtractResult> {
    const pageName = this.parsePageName(url);
    if (!pageName) {
      throw new Error(`Cannot parse Facebook page name from URL: ${url}`);
    }

    const { runId, datasetId } = await runActor(FACEBOOK_ACTOR_ID, {
      startUrls: [{ url }],
      resultsLimit: 20,
    });

    await waitForRun(runId, 180_000);
    const items = await getDatasetItems<FacebookProfileApifyResult>(datasetId);

    if (!items.length) {
      throw new Error(`No posts found for Facebook page: ${pageName}`);
    }

    const first = items[0];
    const postUrls = items.map((i) => i.postUrl).filter(Boolean);
    const discoveredUrls: DiscoveredUrl[] = items
      .filter((i) => i.postUrl)
      .map((i) => ({
        url: i.postUrl,
        title: i.postText ? i.postText.slice(0, 100) : undefined,
        publishedAt: i.timestamp || undefined,
        contentType: 'text_post' as const,
      }));

    return {
      kolName: first.pageName || pageName,
      kolAvatarUrl: null,
      platformId: first.pageId || pageName,
      platformUrl: `https://www.facebook.com/${pageName}`,
      postUrls,
      discoveredUrls,
    };
  }

  private parsePageName(url: string): string | null {
    const match = url.match(/facebook\.com\/([\w.-]+)/);
    return match ? match[1] : null;
  }
}

export const facebookProfileExtractor = new FacebookProfileExtractor();
