/**
 * Twitter/X Profile Extractor
 *
 * Extracts profile info and tweet URLs from Twitter/X profile URLs.
 * Uses twitterapi.io API (requires TWITTERAPI_IO_KEY env var).
 *
 * Supported URL formats:
 * - https://x.com/username
 * - https://twitter.com/username
 * - https://www.x.com/username/
 */

import { ProfileExtractor, ProfileExtractResult } from './profile-extractor';

const TWITTER_API_BASE = 'https://api.twitterapi.io/twitter';

interface TwitterApiUserResponse {
  data: {
    id: string;
    name: string;
    userName: string;
    profilePicture: string;
    description: string;
    followers: number;
    following: number;
  };
  status: string;
}

interface TwitterApiTweet {
  id: string;
  url: string;
  text: string;
  type: string;
  createdAt: string;
  author: { userName: string };
}

interface TwitterApiTimelineResponse {
  tweets: TwitterApiTweet[];
  has_next_page: boolean;
  next_cursor: string;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const REQUEST_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 0 : 1000;

// ── Global request queue — serializes all twitterapi.io calls ──

let lastRequestTime = 0;
let requestQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const task = requestQueue.then(async () => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
    }
    lastRequestTime = Date.now();
    return fn();
  });

  // Keep the queue chain going regardless of success/failure
  requestQueue = task.then(
    () => {},
    () => {}
  );

  return task;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await enqueue(() => fetch(url, options));

    if (response.status === 429 && attempt < retries) {
      const retryAfter = response.headers.get('retry-after');
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    return response;
  }

  throw new Error('Twitter API rate limited after all retries');
}

const RESERVED_PATHS = new Set([
  'home',
  'explore',
  'search',
  'settings',
  'notifications',
  'messages',
]);

export class TwitterProfileExtractor extends ProfileExtractor {
  platform = 'twitter';

  private readonly PROFILE_PATTERNS = [
    /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]+\/?$/,
    /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]+\/?\?.*$/,
  ];

  isValidProfileUrl(url: string): boolean {
    if (!this.PROFILE_PATTERNS.some((pattern) => pattern.test(url))) {
      return false;
    }

    // Reject individual tweet URLs
    if (/\/status\//.test(url)) {
      return false;
    }

    // Reject reserved paths
    const username = this.parseUsername(url);
    if (!username || RESERVED_PATHS.has(username.toLowerCase())) {
      return false;
    }

    // Reject /i/ paths (e.g., /i/flow)
    if (/\/(twitter|x)\.com\/i\//.test(url)) {
      return false;
    }

    return true;
  }

  async extractProfile(url: string): Promise<ProfileExtractResult> {
    if (!this.isValidProfileUrl(url)) {
      throw new Error(`Invalid Twitter/X profile URL: ${url}`);
    }

    const apiKey = process.env.TWITTERAPI_IO_KEY;
    if (!apiKey) {
      throw new Error('TWITTERAPI_IO_KEY environment variable is not set');
    }

    const username = this.parseUsername(url)!;
    const userInfo = await this.fetchUserProfile(username, apiKey);
    const tweetData = await this.fetchTweets(username, apiKey, 20);

    return {
      kolName: userInfo.name,
      kolAvatarUrl: userInfo.profilePicture || null,
      platformId: userInfo.userName,
      platformUrl: `https://x.com/${userInfo.userName}`,
      postUrls: tweetData.map((t) => t.url),
      discoveredUrls: tweetData.map((t) => ({
        url: t.url,
        title: t.text.length > 100 ? t.text.slice(0, 97) + '...' : t.text,
        publishedAt: t.createdAt,
      })),
    };
  }

  private parseUsername(url: string): string | null {
    const match = url.match(/(?:twitter|x)\.com\/([\w]+)/);
    if (!match) return null;
    return match[1];
  }

  private async fetchUserProfile(
    username: string,
    apiKey: string
  ): Promise<TwitterApiUserResponse['data']> {
    const response = await fetchWithRetry(
      `${TWITTER_API_BASE}/user/info?userName=${encodeURIComponent(username)}`,
      { headers: { 'X-API-Key': apiKey } }
    );

    if (!response.ok) {
      throw new Error(`Twitter API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as TwitterApiUserResponse;

    if (!data.data || data.status !== 'success') {
      throw new Error(`Twitter user not found: ${username}`);
    }

    return data.data;
  }

  private async fetchTweets(
    username: string,
    apiKey: string,
    maxTweets: number
  ): Promise<Array<{ url: string; text: string; createdAt: string }>> {
    const tweets: Array<{ url: string; text: string; createdAt: string }> = [];
    let cursor: string | undefined;
    const maxPages = Math.ceil(maxTweets / 20);

    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({ userName: username });
      if (cursor) {
        params.set('cursor', cursor);
      }

      const response = await fetchWithRetry(`${TWITTER_API_BASE}/user/last_tweets?${params}`, {
        headers: { 'X-API-Key': apiKey },
      });

      if (!response.ok) {
        throw new Error(`Twitter API timeline error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as TwitterApiTimelineResponse;

      for (const tweet of data.tweets ?? []) {
        // Filter out retweets
        if (tweet.type === 'retweet') continue;

        tweets.push({
          url: tweet.url || `https://x.com/${username}/status/${tweet.id}`,
          text: tweet.text,
          createdAt: tweet.createdAt,
        });

        if (tweets.length >= maxTweets) break;
      }

      if (!data.has_next_page || tweets.length >= maxTweets) break;
      cursor = data.next_cursor;
    }

    return tweets;
  }
}

export const twitterProfileExtractor = new TwitterProfileExtractor();
