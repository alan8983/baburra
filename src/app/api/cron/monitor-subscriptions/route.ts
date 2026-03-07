/**
 * Cron: Monitor Subscriptions
 * GET /api/cron/monitor-subscriptions
 *
 * Called by Vercel Cron every 6 hours.
 * Checks monitored KOL sources for new content.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSourcesForMonitoring } from '@/infrastructure/repositories';
import { checkForNewContent } from '@/domain/services/profile-scrape.service';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const sources = await getSourcesForMonitoring(5);
    let newJobsCreated = 0;

    for (const source of sources) {
      try {
        const result = await checkForNewContent(source.id);
        if (result.jobId) newJobsCreated++;
      } catch (err) {
        console.error(`Failed to check source ${source.id}:`, err);
      }
    }

    return NextResponse.json({
      checked: sources.length,
      newJobsCreated,
    });
  } catch (err) {
    console.error('Cron monitor-subscriptions error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
