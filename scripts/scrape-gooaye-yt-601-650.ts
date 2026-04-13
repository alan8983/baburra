#!/usr/bin/env tsx
/**
 * Scrape Gooaye YouTube EP 601-650 (43 videos found via search).
 *
 * Usage:
 *   npx tsx scripts/scrape-gooaye-yt-601-650.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Load .env.local manually
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

import { PLATFORM_USER_ID } from '../src/lib/constants/config';
import {
  initiateProfileScrape,
  processJobBatch,
} from '../src/domain/services/profile-scrape.service';
import type { ScrapeOverrides } from '../src/domain/models/kol-source';

// ── 43 YouTube video URLs for EP 601-650 ──
const VIDEO_URLS = [
  'https://www.youtube.com/watch?v=PWiDS5birVs', // EP601
  'https://www.youtube.com/watch?v=SsVeRFSIdSg', // EP602
  'https://www.youtube.com/watch?v=kiGLm6DdoeU', // EP603
  'https://www.youtube.com/watch?v=Vh8M4t34xME', // EP604
  'https://www.youtube.com/watch?v=ywU1T4yIPLY', // EP605
  'https://www.youtube.com/watch?v=jJRkpZX3Z1Y', // EP606
  'https://www.youtube.com/watch?v=FcOiL5fCwXg', // EP607
  'https://www.youtube.com/watch?v=6UwJANYH83M', // EP608
  'https://www.youtube.com/watch?v=Iu4yCXv2LEU', // EP609
  'https://www.youtube.com/watch?v=rE9sxD5fx18', // EP610
  'https://www.youtube.com/watch?v=gzVKdhcyDpc', // EP611
  'https://www.youtube.com/watch?v=wTJFXDEx45Q', // EP612
  'https://www.youtube.com/watch?v=H1HZSxoeoPQ', // EP613
  'https://www.youtube.com/watch?v=S65FN_W1aKw', // EP614
  'https://www.youtube.com/watch?v=c7G-8KMGgMU', // EP615
  'https://www.youtube.com/watch?v=XiQPpTKx8z0', // EP616
  'https://www.youtube.com/watch?v=1okY5yZTkIU', // EP617
  'https://www.youtube.com/watch?v=qecXXYP_Upc', // EP619
  'https://www.youtube.com/watch?v=5PAQ0QoR3Zo', // EP620
  'https://www.youtube.com/watch?v=bqDjsJuDRRI', // EP621
  'https://www.youtube.com/watch?v=MM6BOGSsZxU', // EP622
  'https://www.youtube.com/watch?v=QVlUUZMmJcQ', // EP624
  'https://www.youtube.com/watch?v=vSlB4zEONXQ', // EP625
  'https://www.youtube.com/watch?v=45SzeqCUL7M', // EP626
  'https://www.youtube.com/watch?v=xydyrLDDOSI', // EP627
  'https://www.youtube.com/watch?v=zZDHqler2ig', // EP628
  'https://www.youtube.com/watch?v=DANJ_oolSsw', // EP629
  'https://www.youtube.com/watch?v=V8OyAVn1GWk', // EP630
  'https://www.youtube.com/watch?v=9ys0ZQzA2wQ', // EP631
  'https://www.youtube.com/watch?v=dQiv7egC_j4', // EP632
  'https://www.youtube.com/watch?v=u0UXVRfBPIc', // EP634
  'https://www.youtube.com/watch?v=yq3qs9fJr5E', // EP635
  'https://www.youtube.com/watch?v=0Htayzl_uS0', // EP636
  'https://www.youtube.com/watch?v=MsKuUG5lRzg', // EP637
  'https://www.youtube.com/watch?v=kn9xHoNK1Qs', // EP638
  'https://www.youtube.com/watch?v=Y3UKwjPIVeE', // EP639
  'https://www.youtube.com/watch?v=mDGpvZ44vuk', // EP640
  'https://www.youtube.com/watch?v=Dlfe1OZ7Us8', // EP642
  'https://www.youtube.com/watch?v=JPDxWnDUtAw', // EP644
  'https://www.youtube.com/watch?v=g4Oeovjs42U', // EP645
  'https://www.youtube.com/watch?v=cnsLcRD2TMs', // EP646
  'https://www.youtube.com/watch?v=PpgaPfnZuHI', // EP649
  'https://www.youtube.com/watch?v=IL_5Qvka5sU', // EP650
];

const PROFILE_URL = 'https://www.youtube.com/@gooaye';

const OVERRIDES: ScrapeOverrides = {
  ownerUserId: PLATFORM_USER_ID,
  source: 'seed',
  quotaExempt: true,
};

async function main() {
  console.log(`\n=== Gooaye YouTube EP 601-650 Scrape ===`);
  console.log(`Videos: ${VIDEO_URLS.length}`);
  console.log(`Profile: ${PROFILE_URL}`);
  console.log(`Owner: ${PLATFORM_USER_ID}\n`);

  const startTime = Date.now();

  // Initiate scrape with specific URLs
  console.log('Initiating scrape job...');
  const result = await initiateProfileScrape(
    PROFILE_URL,
    PLATFORM_USER_ID,
    VIDEO_URLS,
    OVERRIDES
  );

  console.log(`Job created: ${result.jobId} (${result.totalUrls} URLs)\n`);

  // Drive processJobBatch until completion
  let progress = result.initialProgress;
  let lastLog = Date.now();

  while (progress.status !== 'completed' && progress.status !== 'failed') {
    progress = await processJobBatch(result.jobId, 5, 600_000, OVERRIDES);

    const now = Date.now();
    // Log every 30 seconds or on status change
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

  // Final summary
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

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
