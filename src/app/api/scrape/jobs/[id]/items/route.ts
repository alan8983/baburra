/**
 * Scrape Job Items API
 * GET /api/scrape/jobs/[id]/items
 *
 * Returns the per-URL state machine for a scrape job. Powers the
 * per-URL progress checklist in ScrapeProgress. Ownership is enforced
 * identically to GET /api/scrape/jobs/[id] — only the user who
 * triggered the job may read its items.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { unauthorizedError, notFoundError, forbiddenError, internalError } from '@/lib/api/error';
import { getScrapeJobById, getScrapeJobItems } from '@/infrastructure/repositories';

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

    const items = await getScrapeJobItems(id);
    return NextResponse.json(items);
  } catch (err) {
    return internalError(err, 'Failed to fetch scrape job items');
  }
}
