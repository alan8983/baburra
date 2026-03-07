/**
 * Scrape Job Detail API
 * GET /api/scrape/jobs/[id]
 *
 * Returns the status and progress of a scrape job.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { unauthorizedError, notFoundError, forbiddenError, internalError } from '@/lib/api/error';
import { getScrapeJobById } from '@/infrastructure/repositories';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { id } = await params;
    const job = await getScrapeJobById(id);
    if (!job) return notFoundError('Scrape job');

    if (job.triggeredBy && job.triggeredBy !== userId) {
      return forbiddenError('You can only view your own scrape jobs');
    }

    return NextResponse.json(job);
  } catch (err) {
    return internalError(err, 'Failed to fetch scrape job');
  }
}
