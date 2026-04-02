/**
 * RSS Feed Resolver — resolves Spotify, Apple Podcasts, and direct RSS URLs
 * to actual RSS feed URLs.
 *
 * All resolution uses free, unauthenticated APIs:
 * - Spotify: oEmbed for show name → iTunes Search API → feedUrl
 * - Apple: iTunes Lookup API → feedUrl
 * - Direct RSS: passthrough
 */

/**
 * Search iTunes for a podcast by name and return matching feed URLs.
 * The iTunes Search API is free, requires no authentication, and indexes
 * nearly all public podcasts worldwide.
 */
export async function searchItunesPodcasts(
  query: string
): Promise<Array<{ feedUrl: string; trackId: number; trackName: string }>> {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', query);
  url.searchParams.set('media', 'podcast');
  url.searchParams.set('entity', 'podcast');
  url.searchParams.set('limit', '5');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`iTunes Search API failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    resultCount: number;
    results: Array<{ feedUrl?: string; trackId: number; trackName: string }>;
  };

  return (data.results ?? [])
    .filter((r) => !!r.feedUrl)
    .map((r) => ({
      feedUrl: r.feedUrl!,
      trackId: r.trackId,
      trackName: r.trackName,
    }));
}

/**
 * Resolve a Spotify show URL to an RSS feed URL.
 *
 * Flow: Spotify oEmbed for show name → iTunes Search API → feedUrl
 * No API keys required.
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

  // Search iTunes for the show name (free, no auth needed)
  const results = await searchItunesPodcasts(showName);

  if (results.length === 0) {
    throw new Error(`No podcast found in iTunes for: "${showName}"`);
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
 * No API keys required — all resolution uses free Apple/Spotify APIs.
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
