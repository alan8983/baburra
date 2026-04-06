import { isUrlLike, getSupportedPlatform } from './url';
import { detectProfilePlatform, type ProfilePlatform } from './detect-profile-platform';

export interface ParsedSegment {
  text: string;
  isUrl: boolean;
  platform: string | null;
}

export type InputMode = 'empty' | 'text' | 'post-urls' | 'profile-url';

export interface ParsedInput {
  mode: InputMode;
  /** Supported post URLs (populated for post-urls mode, may also contain URLs in text mode). */
  urls: string[];
  hasUnsupportedUrls: boolean;
  segments: ParsedSegment[];
  /** Set only when mode === 'profile-url'. */
  profilePlatform: ProfilePlatform | null;
  /** Set only when mode === 'profile-url'. */
  profileUrl: string | null;
}

/**
 * Parse textarea content into segments separated by semicolons or newlines.
 * Determines whether the input should route to:
 *  - `profile-url`: a single KOL profile URL (YouTube channel, X handle, podcast RSS, etc.) → scrape flow
 *  - `post-urls`:   one or more individual post URLs → background import
 *  - `text`:        anything with non-URL content → quick-input draft
 *  - `empty`:       no content
 *
 * A single input that is a recognized profile URL takes precedence over the
 * post-urls path; this is required so a pasted `youtube.com/@handle` routes to
 * the scrape flow rather than the import flow.
 */
export function parseInputContent(content: string): ParsedInput {
  const raw = content.trim();
  if (!raw) {
    return {
      mode: 'empty',
      urls: [],
      hasUnsupportedUrls: false,
      segments: [],
      profilePlatform: null,
      profileUrl: null,
    };
  }

  // Split by semicolons or newlines, filter empty segments
  const parts = raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      mode: 'empty',
      urls: [],
      hasUnsupportedUrls: false,
      segments: [],
      profilePlatform: null,
      profileUrl: null,
    };
  }

  // Profile-URL check: only when the whole input is a single URL that matches
  // a KOL profile pattern.
  if (parts.length === 1) {
    const only = parts[0];
    const profilePlatform = detectProfilePlatform(only);
    if (profilePlatform) {
      return {
        mode: 'profile-url',
        urls: [],
        hasUnsupportedUrls: false,
        segments: [{ text: only, isUrl: true, platform: profilePlatform }],
        profilePlatform,
        profileUrl: only,
      };
    }
  }

  const segments: ParsedSegment[] = parts.map((text) => {
    const isUrl = isUrlLike(text);
    const platform = isUrl ? getSupportedPlatform(text) : null;
    return { text, isUrl, platform };
  });

  const urlSegments = segments.filter((s) => s.isUrl);
  const nonUrlSegments = segments.filter((s) => !s.isUrl);
  const hasUnsupportedUrls = urlSegments.some((s) => s.platform === null);
  const supportedUrls = urlSegments.filter((s) => s.platform !== null).map((s) => s.text);

  // All segments are URLs → batch import mode (post-urls)
  if (nonUrlSegments.length === 0 && urlSegments.length > 0) {
    return {
      mode: hasUnsupportedUrls ? 'text' : 'post-urls',
      urls: supportedUrls,
      hasUnsupportedUrls,
      segments,
      profilePlatform: null,
      profileUrl: null,
    };
  }

  // Any non-URL segment → text mode
  return {
    mode: 'text',
    urls: supportedUrls,
    hasUnsupportedUrls,
    segments,
    profilePlatform: null,
    profileUrl: null,
  };
}
