/**
 * YouTube Channel Extractor
 *
 * Extracts channel info and video URLs from YouTube channel/handle URLs.
 * Uses YouTube Data API v3 (requires YOUTUBE_DATA_API_KEY env var).
 *
 * Supported URL formats:
 * - https://www.youtube.com/@handle
 * - https://www.youtube.com/channel/UC...
 * - https://www.youtube.com/c/ChannelName
 */

import { ProfileExtractor, ProfileExtractResult } from './profile-extractor';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

interface YouTubeChannelSnippet {
  title: string;
  thumbnails?: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
  };
}

interface YouTubeChannelItem {
  id: string;
  snippet: YouTubeChannelSnippet;
}

interface YouTubeChannelsResponse {
  items?: YouTubeChannelItem[];
}

interface YouTubeSearchItem {
  id: { videoId: string };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  nextPageToken?: string;
}

type UrlType = 'handle' | 'channelId' | 'customName';

export class YouTubeChannelExtractor extends ProfileExtractor {
  platform = 'youtube';

  private readonly PROFILE_PATTERNS = [
    /^https?:\/\/(www\.)?youtube\.com\/@[\w.-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/channel\/UC[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/c\/[\w.-]+/,
  ];

  isValidProfileUrl(url: string): boolean {
    return this.PROFILE_PATTERNS.some((pattern) => pattern.test(url));
  }

  async extractProfile(url: string): Promise<ProfileExtractResult> {
    if (!this.isValidProfileUrl(url)) {
      throw new Error(`Invalid YouTube channel URL: ${url}`);
    }

    const apiKey = process.env.YOUTUBE_DATA_API_KEY;
    if (!apiKey) {
      throw new Error('YOUTUBE_DATA_API_KEY environment variable is not set');
    }

    const { type, value } = this.parseProfileUrl(url);
    const channel = await this.resolveChannel(type, value, apiKey);

    const avatarUrl =
      channel.snippet.thumbnails?.high?.url ??
      channel.snippet.thumbnails?.medium?.url ??
      channel.snippet.thumbnails?.default?.url ??
      null;

    const postUrls = await this.fetchVideoUrls(channel.id, apiKey);

    const platformUrl = `https://www.youtube.com/channel/${channel.id}`;

    return {
      kolName: channel.snippet.title,
      kolAvatarUrl: avatarUrl,
      platformId: channel.id,
      platformUrl,
      postUrls,
    };
  }

  private parseProfileUrl(url: string): { type: UrlType; value: string } {
    // @handle format
    const handleMatch = url.match(/youtube\.com\/@([\w.-]+)/);
    if (handleMatch) {
      return { type: 'handle', value: handleMatch[1] };
    }

    // /channel/UCXXX format
    const channelMatch = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
    if (channelMatch) {
      return { type: 'channelId', value: channelMatch[1] };
    }

    // /c/Name format
    const customMatch = url.match(/youtube\.com\/c\/([\w.-]+)/);
    if (customMatch) {
      return { type: 'customName', value: customMatch[1] };
    }

    throw new Error(`Could not parse YouTube channel URL: ${url}`);
  }

  private async resolveChannel(
    type: UrlType,
    value: string,
    apiKey: string
  ): Promise<YouTubeChannelItem> {
    let params: string;

    switch (type) {
      case 'handle':
        params = `forHandle=${encodeURIComponent(value)}`;
        break;
      case 'channelId':
        params = `id=${encodeURIComponent(value)}`;
        break;
      case 'customName':
        params = `forUsername=${encodeURIComponent(value)}`;
        break;
    }

    const url = `${YOUTUBE_API_BASE}/channels?${params}&part=snippet&key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as YouTubeChannelsResponse;

    if (!data.items?.length) {
      throw new Error(`YouTube channel not found for ${type}: ${value}`);
    }

    return data.items[0];
  }

  private async fetchVideoUrls(channelId: string, apiKey: string): Promise<string[]> {
    const urls: string[] = [];
    let pageToken: string | undefined;

    // Fetch up to 50 videos (single page)
    const params = new URLSearchParams({
      channelId,
      type: 'video',
      order: 'date',
      maxResults: '50',
      part: 'id',
      key: apiKey,
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);

    if (!response.ok) {
      throw new Error(`YouTube API search error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as YouTubeSearchResponse;

    for (const item of data.items ?? []) {
      if (item.id?.videoId) {
        urls.push(`https://www.youtube.com/watch?v=${item.id.videoId}`);
      }
    }

    return urls;
  }
}

export const youtubeChannelExtractor = new YouTubeChannelExtractor();
