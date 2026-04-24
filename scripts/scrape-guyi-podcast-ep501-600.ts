#!/usr/bin/env tsx
/**
 * Scrape 股癌 (Gooaye) Podcast EP501-600 via RSS feed.
 *
 * Fetches the full RSS feed, filters to episodes EP501-EP600 by title,
 * constructs podcast-rss:// URLs, then drives the existing import pipeline
 * (Deepgram transcription → Gemini analysis → post creation).
 *
 * Usage:
 *   npx tsx scripts/scrape-guyi-podcast-ep501-600.ts                 # full run
 *   npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --dry-run       # preview matched episodes
 *   npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --limit 5       # first 5 episodes only
 *   npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --batch-size 3  # 3 URLs per batch (default 3)
 *
 * Pre-reqs: `.env.local` with SUPABASE, GEMINI_API_KEYS, DEEPGRAM_API_KEY.
 *
 * Cost estimate:
 *   - Deepgram: ~$0.0043/min × 120min × 100 eps ≈ $52
 *   - Gemini:   ~600 calls total (well within Flash-Lite daily quota with multi-key pool)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Load .env.local manually (before any imports that read env)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

import { XMLParser } from 'fast-xml-parser';
import { PLATFORM_USER_ID } from '../src/lib/constants/config';
import { encodeEpisodeUrl } from '../src/infrastructure/extractors/podcast.extractor';
import {
  initiateProfileScrape,
  processJobBatch,
  type UrlCompletionHook,
} from '../src/domain/services/profile-scrape.service';
import type { ScrapeOverrides } from '../src/domain/models/kol-source';
import { writeSummary } from './lib/summarize-run';

// ── Config ───────────────────────────────────────────────────────────────────

// 股癌 SoundOn RSS feed URL
// Verify: https://podcasts.apple.com/tw/podcast/股癌-gooaye/id1500839292
// Canonical Gooaye feed — matches kol_sources.platform_id on remote.
// Previous hardcoded UUID (30cee1f0-...) 404'd as of 2026-04-25; sourced current
// UUID via `SELECT platform_id FROM kol_sources WHERE name='Gooaye 股癌' AND platform='podcast'`.
const GUYI_RSS_FEED = 'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml';

// Apple Podcasts profile URL (used as profileUrl for initiateProfileScrape)
const PROFILE_URL = 'https://podcasts.apple.com/tw/podcast/股癌-gooaye/id1500839292';

const EP_MIN = 501;
const EP_MAX = 600;

const OVERRIDES: ScrapeOverrides = {
  ownerUserId: PLATFORM_USER_ID,
  source: 'seed',
  quotaExempt: true,
};

// ── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit = Infinity;
  let batchSize = 3;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--limit') limit = parseInt(args[++i], 10);
    else if (a === '--batch-size') batchSize = parseInt(args[++i], 10);
  }
  return { dryRun, limit, batchSize };
}

const { dryRun, limit, batchSize } = parseArgs();

// ── RSS parsing ──────────────────────────────────────────────────────────────

interface RssItem {
  title?: string;
  guid?: string | { '#text': string };
  pubDate?: string;
  'itunes:episode'?: number | string;
  'itunes:duration'?: string | number;
  enclosure?: { '@_url'?: string };
}

function extractGuid(item: RssItem): string | null {
  if (typeof item.guid === 'string') return item.guid;
  if (typeof item.guid === 'object' && item.guid?.['#text']) return item.guid['#text'];
  return null;
}

function extractEpNumber(item: RssItem): number | null {
  // Try itunes:episode first
  if (item['itunes:episode'] != null) {
    const n = Number(item['itunes:episode']);
    if (!isNaN(n)) return n;
  }
  // Fallback: parse from title (e.g. "EP501 ..." or "EP 501 ...")
  if (item.title) {
    const m = item.title.match(/EP\s?(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

// ── JSONL run log + summary on exit ──────────────────────────────────────────
// Each successful/failed URL writes one JSONL line to scripts/logs/seed-run-<ts>.jsonl.
// On process exit (normal, crash, or SIGINT) summarize-run writes the
// aggregate summary.json alongside. Partial runs are flagged.

const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = path.join(LOG_DIR, `seed-run-${RUN_TS}.jsonl`);
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

let runCompletedNormally = false;
let anyLogWritten = false;

const onUrlComplete: UrlCompletionHook = (url, result, error) => {
  anyLogWritten = true;
  const entry = result
    ? {
        url: result.url,
        status: result.status,
        error: result.error,
        title: result.title,
        kolName: result.kolName,
        stockTickers: result.stockTickers,
        timings: result.timings,
        ts: new Date().toISOString(),
      }
    : {
        url,
        status: 'error' as const,
        error: error?.message ?? 'unknown error',
        ts: new Date().toISOString(),
      };
  logStream.write(JSON.stringify(entry) + '\n');
};

function writeFinalSummary() {
  try {
    logStream.end();
  } catch {
    /* ignore */
  }
  if (!anyLogWritten) return;
  try {
    const output = writeSummary(LOG_PATH, { partial: !runCompletedNormally });
    console.log(`\n[summary] Wrote: ${output}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[summary] Failed to write summary: ${msg}`);
  }
}

let sigintReceived = false;
process.on('SIGINT', () => {
  if (sigintReceived) {
    console.warn('\n[signal] Second SIGINT — exiting immediately.');
    process.exit(130);
  }
  sigintReceived = true;
  console.warn('\n[signal] SIGINT received — finalizing log + summary...');
  writeFinalSummary();
  process.exit(130);
});
process.on('SIGTERM', () => {
  console.warn('\n[signal] SIGTERM received — finalizing log + summary...');
  writeFinalSummary();
  process.exit(143);
});

async function main() {
  console.log(`\n=== 股癌 Podcast EP${EP_MIN}-${EP_MAX} Scrape ===`);
  console.log(`RSS: ${GUYI_RSS_FEED}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${limit < Infinity ? ` (limit=${limit})` : ''}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Log: ${LOG_PATH}\n`);

  // 1. Fetch and parse the RSS feed
  console.log('Fetching RSS feed...');
  const feedResponse = await fetch(GUYI_RSS_FEED);
  if (!feedResponse.ok) {
    throw new Error(`Failed to fetch RSS: ${feedResponse.status} ${feedResponse.statusText}`);
  }

  const feedXml = await feedResponse.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'item' || name === 'podcast:transcript',
  });
  const parsed = parser.parse(feedXml);
  const channel = parsed?.rss?.channel;
  if (!channel) throw new Error('Invalid RSS: no <channel>');

  const allItems: RssItem[] = Array.isArray(channel.item) ? channel.item : [channel.item];
  console.log(`Total episodes in feed: ${allItems.length}`);

  // 2. Filter to EP501-600
  const matched: { item: RssItem; ep: number; url: string }[] = [];
  for (const item of allItems) {
    const ep = extractEpNumber(item);
    if (ep == null || ep < EP_MIN || ep > EP_MAX) continue;

    const guid = extractGuid(item);
    if (!guid) {
      console.warn(`  EP${ep}: no GUID, skipping`);
      continue;
    }

    matched.push({
      item,
      ep,
      url: encodeEpisodeUrl(GUYI_RSS_FEED, guid),
    });
  }

  // Sort by episode number
  matched.sort((a, b) => a.ep - b.ep);

  // Apply limit
  const episodes = matched.slice(0, limit);

  console.log(`Matched EP${EP_MIN}-${EP_MAX}: ${matched.length} episodes`);
  if (limit < matched.length) console.log(`Limited to: ${episodes.length}`);

  if (episodes.length === 0) {
    console.log('No episodes to process — done.');
    return;
  }

  // 3. Preview
  console.log('\nEpisodes:');
  for (const { ep, item } of episodes) {
    const dur = item['itunes:duration'] ?? '?';
    console.log(`  EP${ep}: ${item.title ?? '(no title)'} [${dur}]`);
  }

  if (dryRun) {
    console.log(`\nDry run complete — ${episodes.length} episodes would be scraped.`);
    return;
  }

  // 4. Initiate scrape job
  const episodeUrls = episodes.map((e) => e.url);
  console.log(`\nInitiating scrape job (${episodeUrls.length} URLs)...`);

  const result = await initiateProfileScrape(PROFILE_URL, PLATFORM_USER_ID, episodeUrls, OVERRIDES);

  console.log(`Job created: ${result.jobId} (${result.totalUrls} URLs)\n`);

  // 5. Drive batch processing until completion
  let progress = result.initialProgress;
  let lastLog = Date.now();
  const startTime = Date.now();

  while (progress.status !== 'completed' && progress.status !== 'failed') {
    // Use long timeout (10 min) since Deepgram transcription can take minutes per episode
    progress = await processJobBatch(result.jobId, batchSize, 600_000, OVERRIDES, onUrlComplete);

    const now = Date.now();
    if (now - lastLog >= 30_000 || progress.status === 'completed' || progress.status === 'failed') {
      const elapsed = ((now - startTime) / 1000).toFixed(0);
      console.log(
        `[${elapsed}s] ${progress.processedUrls}/${progress.totalUrls} processed | ` +
          `imported=${progress.importedCount} dup=${progress.duplicateCount} ` +
          `filtered=${progress.filteredCount} errors=${progress.errorCount} | ` +
          `status=${progress.status}`
      );
      lastLog = now;
    }
  }

  // 6. Final summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n=== COMPLETE (${elapsed}s) ===`);
  console.log(`  Status: ${progress.status}`);
  console.log(`  Processed: ${progress.processedUrls}/${progress.totalUrls}`);
  console.log(`  Imported: ${progress.importedCount}`);
  console.log(`  Duplicates: ${progress.duplicateCount}`);
  console.log(`  Filtered: ${progress.filteredCount}`);
  console.log(`  Errors: ${progress.errorCount}`);

  const errorRate =
    progress.processedUrls > 0 ? progress.errorCount / progress.processedUrls : 0;
  if (errorRate > 0.3) {
    console.warn(`\n  WARNING: High error rate (${(errorRate * 100).toFixed(0)}%)`);
  }
}

main()
  .then(() => {
    runCompletedNormally = true;
    writeFinalSummary();
  })
  .catch((err) => {
    console.error('Fatal:', err);
    writeFinalSummary();
    process.exit(1);
  });
