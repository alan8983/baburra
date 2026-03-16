/**
 * Scrape Job Continue API
 * POST /api/scrape/jobs/[id]/continue
 *
 * Processes the next batch of URLs for a scrape job that is still in progress.
 * Called by the frontend during polling to drive batch processing forward.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { unauthorizedError, notFoundError, forbiddenError, internalError } from '@/lib/api/error';
import { getScrapeJobById } from '@/infrastructure/repositories';
import { processJobBatch } from '@/domain/services/profile-scrape.service';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { id } = await params;
    const job = await getScrapeJobById(id);
    if (!job) return notFoundError('Scrape job');

    if (job.triggeredBy && job.triggeredBy !== userId) {
      return forbiddenError('You can only continue your own scrape jobs');
    }

    // Only continue jobs that still have work to do
    if (
      job.status === 'completed' ||
      job.status === 'failed' ||
      job.status === 'permanently_failed'
    ) {
      return NextResponse.json(job);
    }

    // Process next batch (5 URLs at a time, 50s timeout for Vercel)
    const progress = await processJobBatch(id, 5, 50_000);

    return NextResponse.json(progress);
  } catch (err) {
    return internalError(err, 'Failed to continue scrape job');
  }
}
