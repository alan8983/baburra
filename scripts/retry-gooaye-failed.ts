#!/usr/bin/env tsx
/**
 * Retry Gooaye EP 601-650 failed videos (14 URLs).
 * Runs with fixed code: structured JSON for analyzeDraftContent + statement_type column.
 * Includes golden flow pipeline timing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

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

import { processUrl } from '../src/domain/services/import-pipeline.service';

const FAILED_URLS = [
  'https://www.youtube.com/watch?v=kiGLm6DdoeU', // EP603
  'https://www.youtube.com/watch?v=ywU1T4yIPLY', // EP605
  'https://www.youtube.com/watch?v=jJRkpZX3Z1Y', // EP606
  'https://www.youtube.com/watch?v=Iu4yCXv2LEU', // EP609
  'https://www.youtube.com/watch?v=rE9sxD5fx18', // EP610
  'https://www.youtube.com/watch?v=c7G-8KMGgMU', // EP615
  'https://www.youtube.com/watch?v=QVlUUZMmJcQ', // EP624
  'https://www.youtube.com/watch?v=vSlB4zEONXQ', // EP625
  'https://www.youtube.com/watch?v=xydyrLDDOSI', // EP627
  'https://www.youtube.com/watch?v=kn9xHoNK1Qs', // EP638
  'https://www.youtube.com/watch?v=mDGpvZ44vuk', // EP640
  'https://www.youtube.com/watch?v=JPDxWnDUtAw', // EP644
  'https://www.youtube.com/watch?v=g4Oeovjs42U', // EP645
  'https://www.youtube.com/watch?v=PpgaPfnZuHI', // EP649
];

async function main() {
  console.log(`\n=== Gooaye Retry: ${FAILED_URLS.length} failed videos ===\n`);

  const kolCache = new Map();
  let success = 0;
  let errors = 0;

  for (const url of FAILED_URLS) {
    const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? url;
    try {
      const result = await processUrl(
        url,
        'a0000000-0000-4000-8000-000000000001',
        'Asia/Taipei',
        true,
        kolCache
      );
      if (result.status === 'success') {
        success++;
        console.log(`  ✓ ${videoId} → ${result.postId}\n`);
      } else {
        console.log(`  ~ ${videoId} → ${result.status} ${result.error || ''}\n`);
        if (result.status === 'error') errors++;
      }
    } catch (err) {
      errors++;
      console.error(`  ✗ ${videoId} → ${err instanceof Error ? err.message : err}\n`);
    }
  }

  console.log(`\n=== RETRY COMPLETE ===`);
  console.log(`  Success: ${success}/${FAILED_URLS.length}`);
  console.log(`  Errors:  ${errors}/${FAILED_URLS.length}`);
}

// Hardcoded Gooaye KOL ID — this script only retries Gooaye URLs.
const GOOAYE_KOL_ID = 'b7a958c4-f9f4-48e1-8dbf-a8966bf1484e';

main()
  .then(async () => {
    // R11: this script bypasses the profile-scrape pipeline (uses processUrl
    // directly), so the synchronous post-completion recompute does not fire.
    // Trigger it manually so the Q2 consistency check below has fresh data.
    const { computeKolScorecard } = await import('../src/domain/services/scorecard.service');
    try {
      await computeKolScorecard(GOOAYE_KOL_ID);
    } catch (err) {
      console.warn('[retry-gooaye] computeKolScorecard failed:', err);
    }
    // Q2: tail-call the consistency check; non-zero exit fails the script.
    const { checkKolConsistency } = await import('./check-kol-consistency');
    const report = await checkKolConsistency(GOOAYE_KOL_ID);
    if (!report.pass) {
      console.error('\n[retry-gooaye] consistency check FAILED for KOL', GOOAYE_KOL_ID);
      for (const r of report.results) {
        if (!r.pass) console.error(`  ${r.invariant}:`, JSON.stringify(r.detail));
      }
      process.exit(1);
    }
    console.log(`[retry-gooaye] consistency check OK for KOL ${GOOAYE_KOL_ID}`);
  })
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
