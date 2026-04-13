#!/usr/bin/env tsx
/**
 * Retry Gooaye failed videos (v2) — with fixes:
 *   - maxOutputTokens 4096 for extractArguments
 *   - finishReason check (MAX_TOKENS → retryable)
 *   - JSON parse errors now retryable (key/model fallback)
 *   - Rejected promises logged
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

// 10 videos that failed in v1 retry (excluding kiGLm6DdoeU which hit a duplicate key)
const FAILED_URLS = [
  'https://www.youtube.com/watch?v=ywU1T4yIPLY', // EP605
  'https://www.youtube.com/watch?v=jJRkpZX3Z1Y', // EP606
  'https://www.youtube.com/watch?v=rE9sxD5fx18', // EP610
  'https://www.youtube.com/watch?v=c7G-8KMGgMU', // EP615
  'https://www.youtube.com/watch?v=QVlUUZMmJcQ', // EP624
  'https://www.youtube.com/watch?v=xydyrLDDOSI', // EP627
  'https://www.youtube.com/watch?v=kn9xHoNK1Qs', // EP638
  'https://www.youtube.com/watch?v=JPDxWnDUtAw', // EP644
  'https://www.youtube.com/watch?v=g4Oeovjs42U', // EP645
  'https://www.youtube.com/watch?v=kiGLm6DdoeU', // EP603 (dup key last time)
];

async function main() {
  console.log(`\n=== Gooaye Retry v2: ${FAILED_URLS.length} videos ===`);
  console.log(`Fixes: maxOutputTokens=4096, finishReason check, JSON parse retry\n`);

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

  console.log(`\n=== RETRY v2 COMPLETE ===`);
  console.log(`  Success: ${success}/${FAILED_URLS.length}`);
  console.log(`  Errors:  ${errors}/${FAILED_URLS.length}`);
}

main().catch(console.error);
