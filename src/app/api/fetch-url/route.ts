// POST /api/fetch-url - 從 URL 擷取社群媒體內容

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { extractorFactory, type ExtractorError } from '@/infrastructure/extractors';

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
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_URL',
            message: 'url is required and must be a non-empty string',
          },
        },
        { status: 400 }
      );
    }

    if (isPrivateUrl(url)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_URL',
            message: 'Private or internal URLs are not allowed',
          },
        },
        { status: 400 }
      );
    }

    try {
      const result = await extractorFactory.extractFromUrl(url);
      return NextResponse.json({ data: result });
    } catch (err) {
      const extractorErr = err as ExtractorError;
      if (extractorErr.code) {
        return NextResponse.json(
          {
            error: {
              code: extractorErr.code,
              message: extractorErr.message,
            },
          },
          { status: 400 }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error('POST /api/fetch-url', err);
    return NextResponse.json(
      {
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch URL content',
        },
      },
      { status: 500 }
    );
  }
}
