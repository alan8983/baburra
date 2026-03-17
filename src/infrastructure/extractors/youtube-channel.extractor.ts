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

import {
  ProfileExtractor,
  ProfileExtractResult,
  DiscoveredUrl,
  ContentType,
} from './profile-extractor';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Parse ISO 8601 duration (e.g. PT1H2M30S) to seconds */
function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

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

interface YouTubeVideoSnippet {
  title: string;
  publishedAt: string;
  liveBroadcastContent?: 'none' | 'live' | 'upcoming';
}

interface YouTubeVideoContentDetails {
  duration?: string; // ISO 8601, e.g. PT1H2M30S
}

interface YouTubeVideoItem {
  id: string;
  snippet: YouTubeVideoSnippet;
  contentDetails?: YouTubeVideoContentDetails;
}

interface YouTubeVideosResponse {
  items?: YouTubeVideoItem[];
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

    const videoIds = await this.fetchVideoIds(channel.id, apiKey);
    const postUrls = videoIds.map((id) => `https://www.youtube.com/watch?v=${id}`);
    const discoveredUrls = await this.fetchVideoSnippets(videoIds, apiKey);

    const platformUrl = `https://www.youtube.com/channel/${channel.id}`;

    return {
      kolName: channel.snippet.title,
      kolAvatarUrl: avatarUrl,
      platformId: channel.id,
      platformUrl,
      postUrls,
      discoveredUrls,
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

  private async fetchVideoIds(channelId: string, apiKey: string): Promise<string[]> {
    const ids: string[] = [];

    // Fetch up to 50 videos (single page)
    const params = new URLSearchParams({
      channelId,
      type: 'video',
      order: 'date',
      maxResults: '50',
      part: 'id',
      key: apiKey,
    });

    const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);

    if (!response.ok) {
      throw new Error(`YouTube API search error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as YouTubeSearchResponse;

    for (const item of data.items ?? []) {
      if (item.id?.videoId) {
        ids.push(item.id.videoId);
      }
    }

    return ids;
  }

  private async fetchVideoSnippets(videoIds: string[], apiKey: string): Promise<DiscoveredUrl[]> {
    if (videoIds.length === 0) return [];

    // YouTube API accepts up to 50 IDs per request
    // Request contentDetails alongside snippet for duration + live detection
    const params = new URLSearchParams({
      id: videoIds.join(','),
      part: 'snippet,contentDetails',
      key: apiKey,
    });

    const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);

    if (!response.ok) {
      // Fallback: return URLs without metadata if snippet fetch fails
      return videoIds.map((id) => ({ url: `https://www.youtube.com/watch?v=${id}` }));
    }

    const data = (await response.json()) as YouTubeVideosResponse;

    const videoMap = new Map<string, YouTubeVideoItem>();
    for (const item of data.items ?? []) {
      videoMap.set(item.id, item);
    }

    return videoIds.map((id) => {
      const item = videoMap.get(id);
      const snippet = item?.snippet;
      const durationSeconds = item?.contentDetails?.duration
        ? parseIsoDuration(item.contentDetails.duration)
        : undefined;
      const contentType = this.classifyContentType(durationSeconds, snippet?.liveBroadcastContent);

      return {
        url: `https://www.youtube.com/watch?v=${id}`,
        title: snippet?.title,
        publishedAt: snippet?.publishedAt,
        contentType,
        durationSeconds,
      };
    });
  }

  private classifyContentType(
    durationSeconds?: number,
    liveBroadcastContent?: string
  ): ContentType {
    // Live stream: currently live or upcoming
    if (liveBroadcastContent === 'live' || liveBroadcastContent === 'upcoming') {
      return 'live_stream';
    }
    // Short: ≤60 seconds
    if (durationSeconds !== undefined && durationSeconds <= 60) {
      return 'short';
    }
    // Default: long video
    return 'long_video';
  }
}

export const youtubeChannelExtractor = new YouTubeChannelExtractor();
