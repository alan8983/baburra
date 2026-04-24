#!/usr/bin/env tsx
/**
 * ORPHANED — DO NOT USE.
 *
 * This script was built against scripts/seed-kol-config.json (a 19-KOL
 * placeholder with feeds.example.com URLs) which has been removed as part of
 * the validate-podcast-pipeline-with-gooaye change. The canonical seed
 * entrypoint is now scripts/scrape-guyi-podcast-ep501-600.ts, which targets a
 * real production RSS feed and one KOL (股癌/Gooaye).
 *
 * Kept here for reference — the override-threading, idempotency check, and
 * per-KOL summary patterns are reusable. If a multi-KOL seeder is wanted
 * later, generate a fresh config from real sources rather than reviving the
 * old placeholder file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Load .env.local for Supabase / API keys
import 'dotenv/config';

import { PLATFORM_USER_ID } from '../src/lib/constants/config';
import { findSourceByPlatformId } from '../src/infrastructure/repositories/kol-source.repository';
import {
  initiateProfileScrape,
  processJobBatch,
  discoverProfileUrls,
} from '../src/domain/services/profile-scrape.service';
import type { ScrapeOverrides } from '../src/domain/models/kol-source';

// ── Types ──

interface SeedKolEntry {
  platform: string;
  identifier: string;
  displayName: string;
  maxPosts: number;
  priority: number;
}

interface KolSummary {
  displayName: string;
  totalUrls: number;
  importedCount: number;
  duplicateCount: number;
  filteredCount: number;
  errorCount: number;
  skipped: boolean;
  skipReason?: string;
}

// ── Config ──

const CONFIG_PATH = path.join(__dirname, 'seed-kol-config.json');
const LOGS_DIR = path.join(__dirname, 'logs');
const DRY_RUN = process.argv.includes('--dry-run');

const OVERRIDES: ScrapeOverrides = {
  ownerUserId: PLATFORM_USER_ID,
  source: 'seed',
  quotaExempt: true,
};

// ── Helpers ──

function loadConfig(): SeedKolEntry[] {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config file not found: ${CONFIG_PATH}`);
    process.exit(1);
  }

  let entries: SeedKolEntry[];
  try {
    entries = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (err) {
    console.error(`Invalid JSON in config: ${err}`);
    process.exit(1);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.error('Config must be a non-empty array');
    process.exit(1);
  }

  const validPlatforms = new Set(['youtube', 'twitter', 'podcast', 'tiktok', 'facebook']);
  for (const entry of entries) {
    if (!entry.platform || !validPlatforms.has(entry.platform)) {
      console.error(`Invalid platform "${entry.platform}" for ${entry.displayName}`);
      process.exit(1);
    }
    if (!entry.identifier) {
      console.error(`Missing identifier for ${entry.displayName}`);
      process.exit(1);
    }
  }

  return entries.sort((a, b) => a.priority - b.priority);
}

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function createErrorLogger() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(LOGS_DIR, `seed-errors-${timestamp}.jsonl`);
  return {
    logPath,
    append(entry: { kol: string; url: string; phase: string; error: string }) {
      const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
      fs.appendFileSync(logPath, line);
    },
  };
}

// ── Main ──

async function main() {
  console.log(`\n=== Baburra Seed Scrape ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  const entries = loadConfig();
  console.log(`Loaded ${entries.length} KOLs from config\n`);

  ensureLogsDir();
  const errorLogger = createErrorLogger();

  const summaries: KolSummary[] = [];
  let totalErrors = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const prefix = `[${i + 1}/${entries.length}]`;
    console.log(`${prefix} Processing ${entry.displayName} (${entry.platform}: ${entry.identifier}) ...`);

    // Idempotency: check if this KOL source already exists with source='seed'
    try {
      const discovery = await discoverProfileUrls(entry.identifier);
      const existingSource = await findSourceByPlatformId(
        discovery.platform,
        discovery.platformId
      );

      if (existingSource?.source === 'seed') {
        console.log(`${prefix}   SKIPPED — already seeded (source=${existingSource.id})`);
        summaries.push({
          displayName: entry.displayName,
          totalUrls: 0,
          importedCount: 0,
          duplicateCount: 0,
          filteredCount: 0,
          errorCount: 0,
          skipped: true,
          skipReason: 'already seeded',
        });
        continue;
      }

      if (DRY_RUN) {
        const urlCount = Math.min(discovery.discoveredUrls?.length ?? discovery.totalCount, entry.maxPosts);
        console.log(`${prefix}   DRY RUN — would process ${urlCount} URLs`);
        summaries.push({
          displayName: entry.displayName,
          totalUrls: urlCount,
          importedCount: 0,
          duplicateCount: 0,
          filteredCount: 0,
          errorCount: 0,
          skipped: true,
          skipReason: 'dry-run',
        });
        continue;
      }

      // Slice discovered URLs to maxPosts
      const allUrls = discovery.discoveredUrls?.map((u: { url: string }) => u.url) ?? [];
      const selectedUrls = allUrls.slice(0, entry.maxPosts);

      console.log(`${prefix}   Discovered ${allUrls.length} URLs, processing ${selectedUrls.length}`);

      // Initiate scrape job with overrides
      const result = await initiateProfileScrape(
        entry.identifier,
        PLATFORM_USER_ID,
        selectedUrls,
        OVERRIDES
      );

      console.log(`${prefix}   Job created: ${result.jobId} (${result.totalUrls} URLs)`);

      // Drive processJobBatch until completion
      let progress = result.initialProgress;
      while (progress.status !== 'completed' && progress.status !== 'failed') {
        progress = await processJobBatch(result.jobId, 5, 600_000, OVERRIDES);
        process.stdout.write(
          `\r${prefix}   Progress: ${progress.processedUrls}/${progress.totalUrls} ` +
            `(imported: ${progress.importedCount}, errors: ${progress.errorCount})`
        );
      }
      console.log(''); // newline after progress

      // High error rate warning
      const errorRate = progress.processedUrls > 0
        ? progress.errorCount / progress.processedUrls
        : 0;
      if (errorRate > 0.5) {
        console.warn(
          `${prefix}   ⚠ HIGH ERROR RATE: ${(errorRate * 100).toFixed(0)}% for ${entry.displayName}`
        );
      }

      // Log any errors from this KOL
      if (progress.errorCount > 0) {
        errorLogger.append({
          kol: entry.displayName,
          url: entry.identifier,
          phase: 'batch',
          error: `${progress.errorCount} errors during processing`,
        });
      }
      totalErrors += progress.errorCount;

      const summary: KolSummary = {
        displayName: entry.displayName,
        totalUrls: progress.totalUrls,
        importedCount: progress.importedCount,
        duplicateCount: progress.duplicateCount,
        filteredCount: progress.filteredCount,
        errorCount: progress.errorCount,
        skipped: false,
      };
      summaries.push(summary);

      console.log(
        `${prefix}   Done: imported=${summary.importedCount} dup=${summary.duplicateCount} ` +
          `filtered=${summary.filteredCount} errors=${summary.errorCount}`
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`${prefix}   FAILED: ${errorMsg}`);
      errorLogger.append({
        kol: entry.displayName,
        url: entry.identifier,
        phase: 'initiation',
        error: errorMsg,
      });
      totalErrors++;
      summaries.push({
        displayName: entry.displayName,
        totalUrls: 0,
        importedCount: 0,
        duplicateCount: 0,
        filteredCount: 0,
        errorCount: 1,
        skipped: false,
      });
    }
  }

  // ── Final Summary ──
  console.log('\n=== FINAL SUMMARY ===\n');

  const seeded = summaries.filter((s) => !s.skipped && s.importedCount > 0);
  const totalImported = summaries.reduce((sum, s) => sum + s.importedCount, 0);
  const totalProcessed = summaries.reduce((sum, s) => sum + s.totalUrls, 0);
  const passRate = totalProcessed > 0 ? totalImported / totalProcessed : 0;

  console.log(`KOLs seeded:     ${seeded.length}/${entries.length} ${seeded.length >= 17 ? '✓' : '✗'} (≥17)`);
  console.log(`Posts imported:  ${totalImported} ${totalImported >= 600 ? '✓' : '✗'} (≥600)`);
  console.log(`Pass rate:       ${(passRate * 100).toFixed(1)}% ${passRate >= 0.55 ? '✓' : '✗'} (≥55%)`);
  console.log(`Total errors:    ${totalErrors}`);

  if (totalErrors > 0) {
    console.log(`Error log:       ${errorLogger.logPath}`);
  }

  console.log('\n--- Per-KOL ---');
  for (const s of summaries) {
    if (s.skipped) {
      console.log(`  ${s.displayName}: SKIPPED (${s.skipReason})`);
    } else {
      console.log(
        `  ${s.displayName}: imported=${s.importedCount} dup=${s.duplicateCount} ` +
          `filtered=${s.filteredCount} errors=${s.errorCount}`
      );
    }
  }

  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
