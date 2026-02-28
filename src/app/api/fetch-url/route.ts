// POST /api/fetch-url - 從 URL 擷取社群媒體內容

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { extractorFactory, type ExtractorError } from '@/infrastructure/extractors';
import { unauthorizedError, errorResponse, internalError } from '@/lib/api/error';

/** Block requests to private/internal IP ranges to prevent SSRF */
function isPrivateUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return true;
    }
  } catch {
    return true; // Invalid URL → reject
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    const body = await request.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return errorResponse(400, 'INVALID_URL', 'url is required and must be a non-empty string');
    }

    if (isPrivateUrl(url)) {
      return errorResponse(400, 'INVALID_URL', 'Private or internal URLs are not allowed');
    }

    try {
      const result = await extractorFactory.extractFromUrl(url);
      return NextResponse.json({ data: result });
    } catch (err) {
      const extractorErr = err as ExtractorError;
      if (extractorErr.code) {
        return errorResponse(400, extractorErr.code, extractorErr.message);
      }
      throw err;
    }
  } catch (err) {
    return internalError(err, 'Failed to fetch URL content');
  }
}
