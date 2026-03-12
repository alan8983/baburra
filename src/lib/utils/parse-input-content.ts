import { isUrlLike, getSupportedPlatform } from './url';

export interface ParsedSegment {
  text: string;
  isUrl: boolean;
  platform: string | null;
}

export interface ParsedInput {
  mode: 'text' | 'urls' | 'empty';
  urls: string[];
  hasUnsupportedUrls: boolean;
  segments: ParsedSegment[];
}

/**
 * Parse textarea content into segments separated by semicolons or newlines.
 * Determines whether the input should be routed as batch URL import or text draft.
 *
 * - All segments are supported URLs → mode = 'urls'
 * - Any segment is plain text → mode = 'text'
 * - No content → mode = 'empty'
 */
export function parseInputContent(content: string): ParsedInput {
  const raw = content.trim();
  if (!raw) {
    return { mode: 'empty', urls: [], hasUnsupportedUrls: false, segments: [] };
  }

  // Split by semicolons or newlines, filter empty segments
  const parts = raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { mode: 'empty', urls: [], hasUnsupportedUrls: false, segments: [] };
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

  // All segments are URLs → batch import mode
  if (nonUrlSegments.length === 0 && urlSegments.length > 0) {
    return {
      mode: hasUnsupportedUrls ? 'text' : 'urls',
      urls: supportedUrls,
      hasUnsupportedUrls,
      segments,
    };
  }

  // Any non-URL segment → text mode
  return {
    mode: 'text',
    urls: supportedUrls,
    hasUnsupportedUrls,
    segments,
  };
}
