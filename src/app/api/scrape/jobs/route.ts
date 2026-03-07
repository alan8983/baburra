/**
 * Scrape Jobs List API
 * GET /api/scrape/jobs
 *
 * Returns all scrape jobs for the current user.
 */

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { unauthorizedError, internalError } from '@/lib/api/error';
import { getScrapeJobsByUser } from '@/infrastructure/repositories';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const jobs = await getScrapeJobsByUser(userId);
    return NextResponse.json(jobs);
  } catch (err) {
    return internalError(err, 'Failed to fetch scrape jobs');
  }
}
