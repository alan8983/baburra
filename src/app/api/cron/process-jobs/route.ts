/**
 * Cron: Process Scrape Jobs
 * GET /api/cron/process-jobs
 *
 * Called by Vercel Cron every 5 minutes.
 * Processes 1 queued job per invocation, 10 URLs in parallel (via Promise.allSettled).
 * Only 1 job per invocation to respect Gemini rate limits under concurrent cron runs.
 * Also recovers stuck/failed jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getQueuedScrapeJobs,
  getStuckProcessingJobs,
  getRetryableFailedJobs,
  resetJobToQueued,
  markPermanentlyFailed,
} from '@/infrastructure/repositories';
import { processJobBatch } from '@/domain/services/profile-scrape.service';
import type { BatchProgress } from '@/domain/services/profile-scrape.service';
import { AI_RATE_LIMIT } from '@/lib/constants/config';

const MAX_RETRIES = 3;
const STUCK_THRESHOLD_MINUTES = 15;
const CRON_TIMEOUT_MS = 50_000; // 50s hard cutoff (Vercel 60s limit)

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Error recovery: reset stuck processing jobs
    const stuckJobs = await getStuckProcessingJobs(STUCK_THRESHOLD_MINUTES);
    for (const job of stuckJobs) {
      console.warn(`Resetting stuck job ${job.id} (processing for > ${STUCK_THRESHOLD_MINUTES}m)`);
      await resetJobToQueued(job.id);
    }

    // Error recovery: retry failed jobs under retry limit
    const failedJobs = await getRetryableFailedJobs(MAX_RETRIES);
    for (const job of failedJobs) {
      if (job.retryCount + 1 >= MAX_RETRIES) {
        console.error(
          `Permanently failing job ${job.id} after ${MAX_RETRIES} attempts. ` +
            `Error: ${job.errorMessage}`
        );
        await markPermanentlyFailed(job.id);
      } else {
        console.warn(
          `Retrying failed job ${job.id} (attempt ${job.retryCount + 1}/${MAX_RETRIES}). ` +
            `Error: ${job.errorMessage}`
        );
        await resetJobToQueued(job.id, true);
      }
    }

    // Process only 1 queued job per cron invocation to respect Gemini rate limits
    const jobs = await getQueuedScrapeJobs(1);
    const results: { jobId: string; progress: BatchProgress }[] = [];

    if (jobs.length > 0) {
      const job = jobs[0];
      try {
        const progress = await processJobBatch(
          job.id,
          AI_RATE_LIMIT.maxConcurrentAnalysis,
          CRON_TIMEOUT_MS
        );
        results.push({ jobId: job.id, progress });
      } catch (err) {
        console.error(`Failed to process job ${job.id}:`, err);
        results.push({
          jobId: job.id,
          progress: {
            processedUrls: job.processedUrls,
            totalUrls: job.totalUrls,
            importedCount: job.importedCount,
            duplicateCount: job.duplicateCount,
            errorCount: job.errorCount,
            filteredCount: job.filteredCount,
            status: 'failed',
          },
        });
      }
    }

    return NextResponse.json({
      recovered: { stuck: stuckJobs.length, retried: failedJobs.length },
      processed: results,
    });
  } catch (err) {
    console.error('Cron process-jobs error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
