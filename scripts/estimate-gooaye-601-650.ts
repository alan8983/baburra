#!/usr/bin/env tsx
/**
 * Dry-run cost estimator for Gooaye EP 601~650 (Podcast + YouTube).
 *
 * Fetches the full RSS feed and YouTube channel, filters for the target
 * episode range, and computes per-episode credit cost estimates.
 *
 * Usage:
 *   npx tsx scripts/estimate-gooaye-601-650.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

// Load .env.local manually (dotenv is not a direct dep)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { composeCost, type Recipe, type BlockId } from '../src/domain/models/credit-blocks';

// ── Config ──
const APPLE_PODCAST_URL =
  'https://podcasts.apple.com/tw/podcast/gooaye-%E8%82%A1%E7%99%8C/id1500839292';
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@gooaye';
const EP_START = 601;
const EP_END = 650;

// ── Types ──
interface RssItem {
  title?: string;
  guid?: string | { '#text'?: string };
  pubDate?: string;
  'itunes:duration'?: string | number;
  'podcast:transcript'?: unknown;
  enclosure?: { '@_url'?: string };
}

interface EpisodeCost {
  epNum: number;
  title: string;
  durationMin: number;
  hasTranscript: boolean;
  recipe: Recipe;
  credits: number;
}

// ── Helpers ──

function parseDuration(d: string | number | undefined): number {
  if (d === undefined || d === null) return 0;
  if (typeof d === 'number') return d;
  if (/^\d+$/.test(d)) return parseInt(d, 10);
  const parts = d.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extractEpNumber(title: string): number | null {
  // Match patterns like "EP601", "EP.601", "Ep 601", "ep601", "#601"
  const m = title.match(/(?:EP\.?\s*|ep\.?\s*|#)(\d{3,4})/i);
  return m ? parseInt(m[1], 10) : null;
}

function hasTranscriptTag(item: RssItem): boolean {
  const t = item['podcast:transcript'];
  if (!t) return false;
  const arr = Array.isArray(t) ? t : [t];
  return arr.some((x: any) => !!x?.['@_url']);
}

function buildPodcastRecipe(hasTranscript: boolean, durationSeconds: number): Recipe {
  const recipe: Recipe = [{ block: 'scrape.rss' as BlockId, units: 1 }];
  if (hasTranscript) {
    recipe.push({ block: 'transcribe.cached_transcript' as BlockId, units: 1 });
    recipe.push({ block: 'ai.analyze.short' as BlockId, units: 1 });
  } else {
    const minutes = Math.ceil(durationSeconds / 60) || 30;
    recipe.push({ block: 'download.audio.long' as BlockId, units: minutes });
    recipe.push({ block: 'transcribe.audio' as BlockId, units: minutes });
    recipe.push({ block: 'ai.analyze.short' as BlockId, units: 1 });
  }
  return recipe;
}

function buildYouTubeRecipe(hasCaptions: boolean, durationSeconds: number): Recipe {
  const recipe: Recipe = [{ block: 'scrape.youtube_meta' as BlockId, units: 1 }];
  if (hasCaptions) {
    recipe.push({ block: 'scrape.youtube_captions' as BlockId, units: 1 });
    recipe.push({ block: 'ai.analyze.short' as BlockId, units: 1 });
  } else {
    const minutes = Math.ceil(durationSeconds / 60) || 30;
    recipe.push({ block: 'download.audio.long' as BlockId, units: minutes });
    recipe.push({ block: 'transcribe.audio' as BlockId, units: minutes });
    recipe.push({ block: 'ai.analyze.short' as BlockId, units: 1 });
  }
  return recipe;
}

// ── Podcast Discovery ──

async function resolveAppleToRss(appleUrl: string): Promise<string> {
  const idMatch = appleUrl.match(/\/id(\d+)/);
  if (!idMatch) throw new Error(`Bad Apple URL: ${appleUrl}`);
  const resp = await fetch(`https://itunes.apple.com/lookup?id=${idMatch[1]}&entity=podcast`);
  if (!resp.ok) throw new Error(`iTunes Lookup failed: ${resp.status}`);
  const data = await resp.json();
  return data.results?.[0]?.feedUrl;
}

async function discoverPodcastEpisodes(): Promise<EpisodeCost[]> {
  console.log('--- PODCAST ---');
  console.log('Resolving Apple Podcasts URL to RSS feed...');
  const feedUrl = await resolveAppleToRss(APPLE_PODCAST_URL);
  console.log(`Feed URL: ${feedUrl}`);

  console.log('Fetching RSS feed...');
  const resp = await fetch(feedUrl);
  if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status}`);
  const xml = await resp.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'item' || name === 'podcast:transcript',
  });
  const parsed = parser.parse(xml);
  const items: RssItem[] = parsed?.rss?.channel?.item ?? [];
  console.log(`Total episodes in feed: ${items.length}`);

  const results: EpisodeCost[] = [];
  for (const item of items) {
    const title = item.title ?? '';
    const epNum = extractEpNumber(title);
    if (epNum === null || epNum < EP_START || epNum > EP_END) continue;

    const durSec = parseDuration(item['itunes:duration']);
    const transcript = hasTranscriptTag(item);
    const recipe = buildPodcastRecipe(transcript, durSec);

    results.push({
      epNum,
      title,
      durationMin: Math.ceil(durSec / 60),
      hasTranscript: transcript,
      recipe,
      credits: composeCost(recipe),
    });
  }

  results.sort((a, b) => a.epNum - b.epNum);
  return results;
}

// ── YouTube Discovery ──

async function discoverYouTubeVideos(): Promise<EpisodeCost[]> {
  console.log('\n--- YOUTUBE ---');
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    console.log('YOUTUBE_DATA_API_KEY not set — skipping YouTube estimation.');
    return [];
  }

  // Resolve channel ID
  const handle = 'gooaye';
  const chResp = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?forHandle=${handle}&part=snippet,contentDetails&key=${apiKey}`
  );
  if (!chResp.ok) throw new Error(`YouTube channels API failed: ${chResp.status}`);
  const chData = await chResp.json();
  const channelId = chData.items?.[0]?.id;
  if (!channelId) throw new Error('Channel not found');
  console.log(`Channel: ${chData.items[0].snippet.title} (${channelId})`);

  // Search for videos matching EP 601-650.
  // YouTube search API is limited, so we search for each EP number.
  // More efficient: search for "EP6" which covers 600-699 range.
  const videoMap = new Map<number, { id: string; title: string }>();

  for (const query of ['EP60', 'EP61', 'EP62', 'EP63', 'EP64', 'EP65']) {
    const params = new URLSearchParams({
      channelId,
      q: query,
      type: 'video',
      order: 'date',
      maxResults: '50',
      part: 'id,snippet',
      key: apiKey,
    });
    const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!resp.ok) {
      console.warn(`Search for "${query}" failed: ${resp.status}`);
      continue;
    }
    const data = await resp.json();
    for (const item of data.items ?? []) {
      const title = item.snippet?.title ?? '';
      const epNum = extractEpNumber(title);
      if (epNum !== null && epNum >= EP_START && epNum <= EP_END) {
        videoMap.set(epNum, { id: item.id.videoId, title });
      }
    }
  }

  console.log(`Found ${videoMap.size} videos in EP ${EP_START}-${EP_END} range`);

  if (videoMap.size === 0) return [];

  // Fetch video details (duration, captions)
  const videoIds = [...videoMap.values()].map((v) => v.id);
  const detailParams = new URLSearchParams({
    id: videoIds.join(','),
    part: 'contentDetails',
    key: apiKey,
  });
  const detailResp = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${detailParams}`
  );
  const detailData = detailResp.ok ? await detailResp.json() : { items: [] };

  const durationMap = new Map<string, number>();
  for (const item of detailData.items ?? []) {
    const iso = item.contentDetails?.duration ?? '';
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (match) {
      const sec =
        parseInt(match[1] || '0') * 3600 +
        parseInt(match[2] || '0') * 60 +
        parseInt(match[3] || '0');
      durationMap.set(item.id, sec);
    }
  }

  // Check caption availability via captions.list
  const captionMap = new Map<string, boolean>();
  for (const vid of videoIds) {
    try {
      const capResp = await fetch(
        `https://www.googleapis.com/youtube/v3/captions?videoId=${vid}&part=snippet&key=${apiKey}`
      );
      if (capResp.ok) {
        const capData = await capResp.json();
        captionMap.set(vid, (capData.items?.length ?? 0) > 0);
      } else {
        // captions.list often returns 403 for non-owner — assume captions exist
        // (Gooaye videos generally have auto-generated Chinese captions)
        captionMap.set(vid, true);
      }
    } catch {
      captionMap.set(vid, true); // assume available
    }
  }

  const results: EpisodeCost[] = [];
  for (const [epNum, { id, title }] of videoMap) {
    const durSec = durationMap.get(id) ?? 0;
    const hasCaptions = captionMap.get(id) ?? true;
    const recipe = buildYouTubeRecipe(hasCaptions, durSec);
    results.push({
      epNum,
      title,
      durationMin: Math.ceil(durSec / 60),
      hasTranscript: hasCaptions,
      recipe,
      credits: composeCost(recipe),
    });
  }

  results.sort((a, b) => a.epNum - b.epNum);
  return results;
}

// ── Main ──

async function main() {
  console.log(`\n=== Gooaye EP ${EP_START}-${EP_END} Cost Estimation ===\n`);

  const podcastEps = await discoverPodcastEpisodes();
  const ytEps = await discoverYouTubeVideos();

  // ── Podcast Summary ──
  console.log(`\n=== PODCAST RESULTS (${podcastEps.length} episodes) ===\n`);
  let podcastTotal = 0;
  let podcastMinutes = 0;
  for (const ep of podcastEps) {
    console.log(
      `  EP${ep.epNum}: ${ep.durationMin}min | transcript=${ep.hasTranscript ? 'YES' : 'NO'} | ${ep.credits} credits | ${ep.title}`
    );
    podcastTotal += ep.credits;
    podcastMinutes += ep.durationMin;
  }
  console.log(`\n  Podcast total: ${podcastTotal} credits (${podcastMinutes} min total audio)`);

  // Missing episodes
  const podcastEpNums = new Set(podcastEps.map((e) => e.epNum));
  const missingPodcast: number[] = [];
  for (let i = EP_START; i <= EP_END; i++) {
    if (!podcastEpNums.has(i)) missingPodcast.push(i);
  }
  if (missingPodcast.length > 0) {
    console.log(`  Missing from feed: ${missingPodcast.join(', ')}`);
  }

  // ── YouTube Summary ──
  console.log(`\n=== YOUTUBE RESULTS (${ytEps.length} videos) ===\n`);
  let ytTotal = 0;
  let ytMinutes = 0;
  for (const ep of ytEps) {
    console.log(
      `  EP${ep.epNum}: ${ep.durationMin}min | captions=${ep.hasTranscript ? 'YES' : 'NO'} | ${ep.credits} credits | ${ep.title}`
    );
    ytTotal += ep.credits;
    ytMinutes += ep.durationMin;
  }
  console.log(`\n  YouTube total: ${ytTotal} credits (${ytMinutes} min total video)`);

  const ytEpNums = new Set(ytEps.map((e) => e.epNum));
  const missingYt: number[] = [];
  for (let i = EP_START; i <= EP_END; i++) {
    if (!ytEpNums.has(i)) missingYt.push(i);
  }
  if (missingYt.length > 0) {
    console.log(`  Missing from search: ${missingYt.join(', ')}`);
  }

  // ── Grand Total ──
  console.log('\n=== GRAND TOTAL ===\n');
  console.log(`  Podcast: ${podcastTotal} credits (${podcastEps.length} episodes)`);
  console.log(`  YouTube: ${ytTotal} credits (${ytEps.length} videos)`);
  console.log(`  Combined: ${podcastTotal + ytTotal} credits`);
  console.log(`  Total audio/video: ${podcastMinutes + ytMinutes} minutes`);

  // Breakdown by cost driver
  const allEps = [...podcastEps, ...ytEps];
  const withTranscript = allEps.filter((e) => e.hasTranscript);
  const withoutTranscript = allEps.filter((e) => !e.hasTranscript);
  console.log(
    `\n  With cached transcript/captions: ${withTranscript.length} items (${withTranscript.reduce((s, e) => s + e.credits, 0)} credits)`
  );
  console.log(
    `  Needs audio transcription: ${withoutTranscript.length} items (${withoutTranscript.reduce((s, e) => s + e.credits, 0)} credits)`
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
