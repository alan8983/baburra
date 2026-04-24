/**
 * Podcast Episode Extractor
 *
 * Extracts transcript content from a single podcast episode.
 * Implements a three-tier transcript fallback:
 *   1. RSS <podcast:transcript> tag → fetch VTT/SRT → parse to plain text
 *   2. Cached transcript from transcripts table
 *   3. Deepgram audio transcription via <enclosure> URL
 *
 * Episodes are identified by synthetic podcast-rss:// URLs that encode
 * the feed URL and episode GUID.
 */

import { XMLParser } from 'fast-xml-parser';
import { SocialMediaExtractor, UrlFetchResult, ExtractorConfig, ExtractorError } from './types';
import { parseTranscriptToText } from '@/lib/utils/vtt-parser';
import {
  findTranscriptByUrl,
  saveTranscript,
} from '@/infrastructure/repositories/transcript.repository';
import { deepgramTranscribe } from '@/infrastructure/api/deepgram.client';

/** Maximum episode duration in seconds (90 minutes) */
const MAX_DURATION_SECONDS = 90 * 60;

/** Podcast-rss URL scheme for internal routing */
const PODCAST_RSS_SCHEME = 'podcast-rss://';

// ── URL Encoding/Decoding ──

/**
 * Encode a feed URL + episode GUID into a synthetic podcast-rss:// URL.
 * Format: podcast-rss://{base64(feedUrl)}#{episodeGuid}
 */
export function encodeEpisodeUrl(feedUrl: string, episodeGuid: string): string {
  const encoded = Buffer.from(feedUrl).toString('base64url');
  return `${PODCAST_RSS_SCHEME}${encoded}#${encodeURIComponent(episodeGuid)}`;
}

/**
 * Decode a podcast-rss:// URL back to feed URL + episode GUID.
 */
export function decodeEpisodeUrl(url: string): { feedUrl: string; episodeGuid: string } {
  if (!url.startsWith(PODCAST_RSS_SCHEME)) {
    throw new ExtractorError('INVALID_URL', `Not a podcast-rss:// URL: ${url}`);
  }

  const withoutScheme = url.slice(PODCAST_RSS_SCHEME.length);
  const hashIndex = withoutScheme.indexOf('#');

  if (hashIndex === -1) {
    throw new ExtractorError('INVALID_URL', 'Missing episode GUID fragment in podcast-rss:// URL');
  }

  const base64Feed = withoutScheme.slice(0, hashIndex);
  const episodeGuid = decodeURIComponent(withoutScheme.slice(hashIndex + 1));
  const feedUrl = Buffer.from(base64Feed, 'base64url').toString('utf-8');

  return { feedUrl, episodeGuid };
}

// ── RSS Feed Parsing ──

interface RssItem {
  title?: string;
  guid?: string | { '#text'?: string };
  enclosure?: { '@_url'?: string; '@_type'?: string };
  pubDate?: string;
  'itunes:duration'?: string | number;
  'podcast:transcript'?: PodcastTranscript | PodcastTranscript[];
}

interface PodcastTranscript {
  '@_url'?: string;
  '@_type'?: string;
}

function getItemGuid(item: RssItem): string | null {
  if (!item.guid) return null;
  if (typeof item.guid === 'string') return item.guid;
  return item.guid['#text'] ?? null;
}

function parseDuration(duration: string | number | undefined): number | undefined {
  if (duration === undefined || duration === null) return undefined;
  if (typeof duration === 'number') return duration;
  if (/^\d+$/.test(duration)) return parseInt(duration, 10);
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

// ── Extractor ──

export class PodcastEpisodeExtractor extends SocialMediaExtractor {
  platform: UrlFetchResult['sourcePlatform'] = 'podcast';

  isValidUrl(url: string): boolean {
    return url.startsWith(PODCAST_RSS_SCHEME);
  }

  async extract(url: string, _config?: ExtractorConfig): Promise<UrlFetchResult> {
    if (!this.isValidUrl(url)) {
      throw new ExtractorError('INVALID_URL', `Not a podcast-rss:// URL: ${url}`);
    }

    const { feedUrl, episodeGuid } = decodeEpisodeUrl(url);

    // Fetch and parse the RSS feed to find the episode
    const feedResponse = await fetch(feedUrl);
    if (!feedResponse.ok) {
      throw new ExtractorError(
        'FETCH_FAILED',
        `Failed to fetch RSS feed: ${feedResponse.status} ${feedResponse.statusText}`
      );
    }

    const feedXml = await feedResponse.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => name === 'item' || name === 'podcast:transcript',
    });

    const parsed = parser.parse(feedXml);
    const items: RssItem[] = parsed?.rss?.channel?.item ?? [];
    const normalizedItems = Array.isArray(items) ? items : [items];

    // Find the episode by GUID
    const episode = normalizedItems.find((item) => getItemGuid(item) === episodeGuid);
    if (!episode) {
      throw new ExtractorError('PARSE_FAILED', `Episode not found with GUID: ${episodeGuid}`);
    }

    // Duration guard
    const durationSeconds = parseDuration(episode['itunes:duration']);
    if (durationSeconds && durationSeconds > MAX_DURATION_SECONDS) {
      throw new ExtractorError(
        'CONTENT_TOO_LONG',
        `Episode exceeds maximum duration of ${MAX_DURATION_SECONDS / 60} minutes (${Math.round(durationSeconds / 60)} min)`
      );
    }

    // Use the stable podcast-rss:// URL as the canonical key for dedup,
    // transcript cache, and post.source_url. SoundOn enclosure URLs carry an
    // upload timestamp query param that is per-episode-stable but still
    // diverges from the podcast-rss:// key `findPostBySourceUrl` is called
    // with in `processUrl`, so using it here would make the pre-insert
    // dedup check always miss on re-runs (full Deepgram re-cost before the
    // unique constraint catches it at INSERT). Keeping the key consistent
    // across findPostBySourceUrl, findTranscriptByUrl, saveTranscript, and
    // createPost gives the podcast path the same idempotency as YouTube.
    const content = await this.fetchTranscript(episode, url);

    return {
      content,
      sourceUrl: url,
      sourcePlatform: 'podcast',
      title: episode.title ?? null,
      images: [],
      postedAt: episode.pubDate ?? null,
      kolName: null,
      kolAvatarUrl: null,
      durationSeconds,
    };
  }

  private async fetchTranscript(episode: RssItem, sourceUrl: string): Promise<string> {
    // Tier 1: RSS <podcast:transcript> tag
    const transcriptContent = await this.tryRssTranscript(episode);
    if (transcriptContent) {
      // Cache the transcript
      await saveTranscript({
        sourceUrl,
        content: transcriptContent,
        source: 'rss_transcript',
      }).catch((err) => console.warn('[PodcastExtractor] Failed to cache RSS transcript:', err));
      return transcriptContent;
    }

    // Tier 2: Cached transcript
    const cached = await findTranscriptByUrl(sourceUrl);
    if (cached) {
      return cached.content;
    }

    // Tier 3: Deepgram audio transcription
    const enclosureUrl = episode.enclosure?.['@_url'];
    const mimeType = episode.enclosure?.['@_type'] ?? 'audio/mpeg';

    if (!enclosureUrl) {
      throw new ExtractorError(
        'FETCH_FAILED',
        'No transcript available and no audio enclosure URL found'
      );
    }

    const audioResponse = await fetch(enclosureUrl);
    if (!audioResponse.ok) {
      throw new ExtractorError(
        'FETCH_FAILED',
        `Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`
      );
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const deepgramContent = await deepgramTranscribe(audioBuffer, mimeType);

    // Cache the Deepgram transcript
    const durationSeconds = parseDuration(episode['itunes:duration']);
    await saveTranscript({
      sourceUrl,
      content: deepgramContent,
      source: 'deepgram',
      durationSeconds,
    }).catch((err) => console.warn('[PodcastExtractor] Failed to cache Deepgram transcript:', err));

    return deepgramContent;
  }

  private async tryRssTranscript(episode: RssItem): Promise<string | null> {
    const transcripts = episode['podcast:transcript'];
    if (!transcripts) return null;

    const arr = Array.isArray(transcripts) ? transcripts : [transcripts];

    // Prefer VTT, then SRT, then any
    const sorted = [...arr].sort((a, b) => {
      const typeOrder = (t: string | undefined) => {
        if (t === 'text/vtt') return 0;
        if (t === 'application/srt' || t === 'application/x-subrip') return 1;
        if (t === 'text/plain') return 2;
        return 3;
      };
      return typeOrder(a['@_type']) - typeOrder(b['@_type']);
    });

    for (const transcript of sorted) {
      const transcriptUrl = transcript['@_url'];
      if (!transcriptUrl) continue;

      try {
        const response = await fetch(transcriptUrl);
        if (!response.ok) continue;

        const text = await response.text();
        if (!text.trim()) continue;

        const mimeType = (transcript['@_type'] ?? 'text/plain') as
          | 'text/vtt'
          | 'application/srt'
          | 'application/x-subrip'
          | 'text/plain';
        const parsed = parseTranscriptToText(text, mimeType);

        if (parsed.length >= 10) {
          return parsed;
        }
      } catch {
        // Try next transcript if this one fails
        continue;
      }
    }

    return null;
  }
}

export const podcastEpisodeExtractor = new PodcastEpisodeExtractor();
