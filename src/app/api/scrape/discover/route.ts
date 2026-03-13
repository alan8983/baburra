/**
 * Scrape Discover API
 * POST /api/scrape/discover
 *
 * Discovers content URLs from a KOL profile without creating a scrape job.
 * Returns discovered URLs with metadata (titles, dates) for user selection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { unauthorizedError, badRequestError, internalError } from '@/lib/api/error';
import { parseBody } from '@/lib/api/validation';
import { discoverProfileUrls } from '@/domain/services/profile-scrape.service';

const discoverSchema = z.object({
  profileUrl: z.string().url('Must be a valid URL'),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const parsed = await parseBody(request, discoverSchema);
    if ('error' in parsed) return parsed.error;

    const result = await discoverProfileUrls(parsed.data.profileUrl);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Unsupported profile URL')) {
      return badRequestError(err.message, 'UNSUPPORTED_PLATFORM');
    }
    if (err instanceof Error && err.message.includes('YOUTUBE_DATA_API_KEY')) {
      return badRequestError('YouTube Data API key is not configured', 'API_KEY_MISSING');
    }
    if (err instanceof Error && err.message.includes('TWITTERAPI_IO_KEY')) {
      return badRequestError('Twitter API key is not configured', 'API_KEY_MISSING');
    }
    return internalError(err, 'Failed to discover profile URLs');
  }
}
