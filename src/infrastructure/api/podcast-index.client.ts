/**
 * PodcastIndex.org API Client
 *
 * Used to resolve Spotify podcast URLs to RSS feed URLs by searching
 * the PodcastIndex directory. Requires a free API key+secret pair
 * registered at https://podcastindex.org/api
 */

import crypto from 'crypto';

export interface PodcastIndexResult {
  feedUrl: string;
  podcastGuid: string;
  title: string;
}

interface PodcastIndexSearchResponse {
  status: string;
  feeds: Array<{
    url: string;
    podcastGuid: string;
    title: string;
  }>;
  count: number;
}

/**
 * Generate PodcastIndex API auth headers.
 * Auth uses SHA-1 hash of: apiKey + apiSecret + unixEpoch
 */
export function generateAuthHeaders(
  apiKey: string,
  apiSecret: string,
  epoch?: number
): Record<string, string> {
  const unixEpoch = epoch ?? Math.floor(Date.now() / 1000);
  const authHash = crypto
    .createHash('sha1')
    .update(apiKey + apiSecret + unixEpoch)
    .digest('hex');

  return {
    'X-Auth-Key': apiKey,
    'X-Auth-Date': String(unixEpoch),
    Authorization: authHash,
    'User-Agent': 'Baburra/1.0',
  };
}

/**
 * Search PodcastIndex by term (show name) and return matching podcasts.
 */
export async function searchByTerm(query: string): Promise<PodcastIndexResult[]> {
  const apiKey = process.env.PODCAST_INDEX_KEY;
  const apiSecret = process.env.PODCAST_INDEX_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      'PODCAST_INDEX_KEY and PODCAST_INDEX_SECRET environment variables are required'
    );
  }

  const url = new URL('https://api.podcastindex.org/api/1.0/search/byterm');
  url.searchParams.set('q', query);

  const headers = generateAuthHeaders(apiKey, apiSecret);

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    throw new Error(`PodcastIndex API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as PodcastIndexSearchResponse;

  if (!data.feeds || !Array.isArray(data.feeds)) {
    return [];
  }

  return data.feeds.map((feed) => ({
    feedUrl: feed.url,
    podcastGuid: feed.podcastGuid,
    title: feed.title,
  }));
}
