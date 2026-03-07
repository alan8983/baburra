/**
 * Scrape Profile API
 * POST /api/scrape/profile
 *
 * Initiates profile scraping for a KOL's channel/profile URL.
 * Rate limited to SCRAPE_DAILY_LIMIT per user per 24h.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { unauthorizedError, badRequestError, internalError } from '@/lib/api/error';
import { errorResponse } from '@/lib/api/validation';
import { parseBody } from '@/lib/api/validation';
import { initiateProfileScrape } from '@/domain/services/profile-scrape.service';
import { getUserScrapeCountLast24h } from '@/infrastructure/repositories';
import { APP_CONFIG } from '@/lib/constants/config';

const scrapeProfileSchema = z.object({
  profileUrl: z.string().url('Must be a valid URL'),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    // Rate limiting: max N scrapes per user per 24h
    const recentCount = await getUserScrapeCountLast24h(userId);
    if (recentCount >= APP_CONFIG.SCRAPE_DAILY_LIMIT) {
      return errorResponse(429, 'RATE_LIMITED', 'Daily scrape limit reached', {
        limit: APP_CONFIG.SCRAPE_DAILY_LIMIT,
        used: recentCount,
      });
    }

    const parsed = await parseBody(request, scrapeProfileSchema);
    if ('error' in parsed) return parsed.error;

    const result = await initiateProfileScrape(parsed.data.profileUrl, userId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Unsupported profile URL')) {
      return badRequestError(err.message, 'UNSUPPORTED_PLATFORM');
    }
    if (err instanceof Error && err.message.includes('YOUTUBE_DATA_API_KEY')) {
      return internalError(err, 'YouTube API configuration error');
    }
    return internalError(err, 'Failed to initiate profile scrape');
  }
}
