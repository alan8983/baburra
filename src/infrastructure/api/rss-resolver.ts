/**
 * RSS Feed Resolver — resolves Spotify, Apple Podcasts, and direct RSS URLs
 * to actual RSS feed URLs.
 */

import { searchByTerm } from './podcast-index.client';

/**
 * Resolve a Spotify show URL to an RSS feed URL.
 *
 * Flow: Extract show ID → Spotify oEmbed for show name → PodcastIndex search → feedUrl
 */
export async function resolveSpotifyToRss(spotifyUrl: string): Promise<string> {
  // Extract show name via Spotify's oEmbed endpoint
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
  const oembedResponse = await fetch(oembedUrl);

  if (!oembedResponse.ok) {
    throw new Error(`Spotify oEmbed failed: ${oembedResponse.status} ${oembedResponse.statusText}`);
  }

  const oembedData = (await oembedResponse.json()) as { title?: string };
  const showName = oembedData.title;

  if (!showName) {
    throw new Error('Could not extract show name from Spotify oEmbed');
  }

  // Search PodcastIndex for the show name
  const results = await searchByTerm(showName);

  if (results.length === 0) {
    throw new Error(`No podcast found in PodcastIndex for: "${showName}"`);
  }

  // Return the first match's feed URL
  return results[0].feedUrl;
}

/**
 * Resolve an Apple Podcasts URL to an RSS feed URL.
 *
 * Flow: Extract numeric ID → iTunes Lookup API → feedUrl
 */
export async function resolveAppleToRss(appleUrl: string): Promise<string> {
  // Extract numeric ID from URL (e.g., /id1234567890)
  const idMatch = appleUrl.match(/\/id(\d+)/);
  if (!idMatch) {
    throw new Error(`Could not extract podcast ID from Apple URL: ${appleUrl}`);
  }

  const podcastId = idMatch[1];
  const lookupUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`;

  const response = await fetch(lookupUrl);
  if (!response.ok) {
    throw new Error(`iTunes Lookup API failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    resultCount: number;
    results: Array<{ feedUrl?: string }>;
  };

  if (data.resultCount === 0 || !data.results[0]?.feedUrl) {
    throw new Error(`No feed URL found for Apple Podcast ID: ${podcastId}`);
  }

  return data.results[0].feedUrl;
}

/**
 * Check if a URL is a direct RSS feed URL.
 */
export function isDirectRssUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    // Common RSS feed patterns
    return (
      path.endsWith('.xml') ||
      path.endsWith('.rss') ||
      path.endsWith('.atom') ||
      path.includes('/feed') ||
      path.includes('/rss') ||
      // Known feed hosts
      parsed.hostname.includes('feeds.') ||
      parsed.hostname.includes('anchor.fm') ||
      parsed.hostname.includes('feedburner')
    );
  } catch {
    return false;
  }
}

/**
 * Check if a URL is a Spotify show URL.
 */
export function isSpotifyShowUrl(url: string): boolean {
  return /^https?:\/\/(open\.)?spotify\.com\/show\//.test(url);
}

/**
 * Check if a URL is an Apple Podcasts show URL.
 */
export function isApplePodcastUrl(url: string): boolean {
  return /^https?:\/\/podcasts\.apple\.com\//.test(url);
}

/**
 * Resolve any supported podcast URL to an RSS feed URL.
 * Routes to the appropriate resolver based on URL pattern.
 */
export async function resolveToRssFeed(url: string): Promise<string> {
  if (isSpotifyShowUrl(url)) {
    return resolveSpotifyToRss(url);
  }

  if (isApplePodcastUrl(url)) {
    return resolveAppleToRss(url);
  }

  if (isDirectRssUrl(url)) {
    return url;
  }

  throw new Error(`Unsupported podcast URL format: ${url}`);
}
