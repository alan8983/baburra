/**
 * KOL Sources API
 * GET /api/kols/[id]/sources — List all platform sources for a KOL,
 * including whether the current user is subscribed to each.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getSourcesByKolId, isSubscribed } from '@/infrastructure/repositories';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { id: kolId } = await params;
    const sources = await getSourcesByKolId(kolId);

    // Enrich each source with the current user's subscription status
    const enriched = await Promise.all(
      sources.map(async (source) => ({
        id: source.id,
        platform: source.platform,
        platformId: source.platformId,
        platformUrl: source.platformUrl,
        scrapeStatus: source.scrapeStatus,
        lastScrapedAt: source.lastScrapedAt?.toISOString() ?? null,
        postsScrapedCount: source.postsScrapedCount,
        monitoringEnabled: source.monitoringEnabled,
        isSubscribed: await isSubscribed(userId, source.id),
      }))
    );

    return NextResponse.json(enriched);
  } catch (err) {
    return internalError(err, 'Failed to fetch KOL sources');
  }
}
