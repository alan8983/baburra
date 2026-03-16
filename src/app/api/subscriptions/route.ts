/**
 * Subscriptions API
 * GET /api/subscriptions — List current user's subscriptions (enriched with KOL data)
 * POST /api/subscriptions — Subscribe to a KOL source (with tier limit enforcement)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import {
  getUserSubscriptionsEnriched,
  subscribe,
  getSubscriberCount,
  getUserSubscriptionCount,
  getSourceById,
  createScrapeJob,
} from '@/infrastructure/repositories';
import { enableMonitoring } from '@/infrastructure/repositories/kol-source.repository';
import { getUserTier } from '@/infrastructure/repositories/profile.repository';
import { unauthorizedError, internalError } from '@/lib/api/error';
import { errorResponse } from '@/lib/api/validation';
import { subscribeSchema, parseBody } from '@/lib/api/validation';
import { APP_CONFIG, SCRAPE_CAPS } from '@/lib/constants/config';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const subscriptions = await getUserSubscriptionsEnriched(userId);
    return NextResponse.json(subscriptions);
  } catch (err) {
    return internalError(err, 'Failed to fetch subscriptions');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const parsed = await parseBody(request, subscribeSchema);
    if ('error' in parsed) return parsed.error;

    // Tier limit enforcement
    const [tier, currentCount] = await Promise.all([
      getUserTier(userId),
      getUserSubscriptionCount(userId),
    ]);
    const limit = APP_CONFIG.SUBSCRIPTION_LIMITS[tier];
    if (currentCount >= limit) {
      return errorResponse(403, 'TIER_LIMIT_REACHED', 'Subscription limit reached', {
        tier,
        limit,
        current: currentCount,
      });
    }

    const subscription = await subscribe(userId, parsed.data.kolSourceId);

    // Auto-enable monitoring if this is the first subscriber
    const count = await getSubscriberCount(parsed.data.kolSourceId);
    if (count === 1) {
      await enableMonitoring(parsed.data.kolSourceId);
    }

    // Historical data expansion trigger
    await triggerHistoricalExpansion(parsed.data.kolSourceId, userId);

    return NextResponse.json(subscription);
  } catch (err) {
    return internalError(err, 'Failed to subscribe');
  }
}

async function triggerHistoricalExpansion(sourceId: string, userId: string) {
  try {
    const source = await getSourceById(sourceId);
    if (!source) return;

    const cap = SCRAPE_CAPS[source.platform] ?? 500;

    if (source.postsScrapedCount >= cap) {
      console.warn(
        `KOL source at cap: ${source.platform} source ${sourceId} has ${source.postsScrapedCount}/${cap} posts`
      );
      return;
    }

    // Create an incremental scrape job for +10 older posts
    // The discovered_urls will be empty — the extractor handles offset-based fetching
    await createScrapeJob(sourceId, 'incremental_check', userId, []);
  } catch (err) {
    // Non-critical — log but don't fail the subscription
    console.error('Historical expansion trigger failed:', err);
  }
}
