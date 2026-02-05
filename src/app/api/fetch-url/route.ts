// POST /api/fetch-url - 從 URL 擷取社群媒體內容

import { NextRequest, NextResponse } from 'next/server';
import {
  extractorFactory,
  type ExtractorError,
} from '@/infrastructure/extractors';

export async function POST(request: NextRequest) {
  try {
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
          message:
            err instanceof Error ? err.message : 'Failed to fetch URL content',
        },
      },
      { status: 500 }
    );
  }
}
