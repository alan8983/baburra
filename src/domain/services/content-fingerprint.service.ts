/**
 * Content Fingerprint Service
 *
 * Normalizes transcript text and computes a stable sha256 fingerprint
 * for cross-platform duplicate detection (D4 in design.md).
 *
 * Normalization pipeline:
 * 1. Strip VTT/SRT timestamp lines
 * 2. Strip speaker labels
 * 3. Strip bracket markers ([Music], [Applause], (inaudible), etc.)
 * 4. Lowercase
 * 5. Remove punctuation (keep intra-word apostrophes)
 * 6. Collapse whitespace
 * 7. Tokenize → take first 500 tokens
 * 8. sha256 hex
 */

import { createHash } from 'crypto';

const MIN_TOKEN_COUNT = 50;
const MAX_TOKEN_COUNT = 500;

/** Strip VTT/SRT timestamp lines: "00:01:23.456 --> 00:01:25.789" and numeric cue IDs */
export function stripTimestamps(text: string): string {
  return text
    .replace(/^\d+\s*$/gm, '') // numeric cue IDs
    .replace(/^\d{1,2}:\d{2}:\d{2}[.,]\d+\s*-->.*$/gm, '') // timestamp arrows
    .replace(/\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}/g, ''); // inline timestamps
}

/** Strip speaker labels: "Speaker 1:", "Alice:", "JOHN:" at start of line */
export function stripSpeakerLabels(text: string): string {
  return text.replace(/^[A-Za-z\u4e00-\u9fff][\w\s]{0,30}:\s/gm, '');
}

/** Strip bracket/paren markers: [Music], [Applause], (inaudible), etc. */
export function stripBracketMarkers(text: string): string {
  return text.replace(/[\[（(][^\]）)]{0,40}[\]）)]/g, '');
}

/** Lowercase the entire string */
export function toLower(text: string): string {
  return text.toLowerCase();
}

/** Remove punctuation, keeping intra-word apostrophes (don't, it's) */
export function stripPunctuation(text: string): string {
  // Replace punctuation that's NOT an apostrophe between word chars
  return text
    .replace(/(?<![a-z])'/g, ' ') // apostrophe not preceded by a letter
    .replace(/'(?![a-z])/g, ' ') // apostrophe not followed by a letter
    .replace(/[^\w'\s]/g, ' ') // everything else non-word
    .replace(/_/g, ' '); // underscores (matched by \w)
}

/** Collapse all whitespace runs to single spaces, trim */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Full normalization pipeline: raw transcript → token array (first N words).
 * Each step is exported individually for independent testing.
 */
export function normalizeTranscript(raw: string): string[] {
  let text = raw;
  text = stripTimestamps(text);
  text = stripSpeakerLabels(text);
  text = stripBracketMarkers(text);
  text = toLower(text);
  text = stripPunctuation(text);
  text = collapseWhitespace(text);

  const tokens = text.split(' ').filter(Boolean);
  return tokens.slice(0, MAX_TOKEN_COUNT);
}

/**
 * Compute a content fingerprint from raw transcript text.
 * Returns null if the transcript has fewer than MIN_TOKEN_COUNT tokens
 * (too short for reliable matching).
 */
export function computeContentFingerprint(raw: string): string | null {
  const tokens = normalizeTranscript(raw);
  if (tokens.length < MIN_TOKEN_COUNT) return null;

  const normalized = tokens.join(' ');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
