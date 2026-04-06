/**
 * Shared detection for KOL profile URLs across supported platforms.
 *
 * Used by both the scrape form UI and parseInputContent() so that platform
 * detection logic lives in exactly one place. Kept free of server-only
 * imports so it can be bundled into client components.
 */

export type ProfilePlatform = 'youtube' | 'twitter' | 'tiktok' | 'facebook' | 'podcast';

const YOUTUBE_CHANNEL_PATTERN = /^https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|@)[\w.-]+/;
const TWITTER_PROFILE_PATTERN = /^https?:\/\/(www\.)?(twitter|x)\.com\/[\w]+\/?$/;
const TIKTOK_PROFILE_PATTERN = /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/?$/;
const FACEBOOK_PROFILE_PATTERN = /^https?:\/\/(www\.)?facebook\.com\/[\w.-]+\/?$/;
const SPOTIFY_SHOW_PATTERN = /^https?:\/\/(open\.)?spotify\.com\/show\//;
const APPLE_PODCAST_PATTERN = /^https?:\/\/podcasts\.apple\.com\//;

const FACEBOOK_POST_EXCLUSIONS = /\/(posts|permalink|share|videos|photo|events|groups)\//;

/**
 * Heuristic check for a direct RSS/Atom podcast feed URL.
 * Mirrors isDirectRssUrl() in src/infrastructure/api/rss-resolver.ts — kept
 * inline here so this module stays client-safe (no server fetch code).
 */
export function isDirectRssUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      path.endsWith('.xml') ||
      path.endsWith('.rss') ||
      path.endsWith('.atom') ||
      path.includes('/feed') ||
      path.includes('/rss') ||
      parsed.hostname.includes('feeds.') ||
      parsed.hostname.includes('anchor.fm') ||
      parsed.hostname.includes('feedburner')
    );
  } catch {
    return false;
  }
}

/**
 * Detects which KOL profile platform a URL belongs to, or null if the URL is
 * not a recognized profile URL (including the case where it's a post URL like
 * youtube.com/watch?v=... or x.com/user/status/...).
 */
export function detectProfilePlatform(url: string): ProfilePlatform | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (YOUTUBE_CHANNEL_PATTERN.test(trimmed)) return 'youtube';
  if (TWITTER_PROFILE_PATTERN.test(trimmed) && !/\/status\//.test(trimmed)) return 'twitter';
  if (TIKTOK_PROFILE_PATTERN.test(trimmed) && !/\/video\//.test(trimmed)) return 'tiktok';
  if (FACEBOOK_PROFILE_PATTERN.test(trimmed) && !FACEBOOK_POST_EXCLUSIONS.test(trimmed)) {
    return 'facebook';
  }
  if (SPOTIFY_SHOW_PATTERN.test(trimmed)) return 'podcast';
  if (APPLE_PODCAST_PATTERN.test(trimmed)) return 'podcast';
  if (isDirectRssUrl(trimmed)) return 'podcast';
  return null;
}
