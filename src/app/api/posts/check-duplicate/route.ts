// GET /api/posts/check-duplicate?url=... - 檢查重複 URL

import { NextRequest, NextResponse } from 'next/server';
import { findPostBySourceUrl } from '@/infrastructure/repositories';
import { badRequestError, internalError } from '@/lib/api/error';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url?.trim()) {
      return badRequestError('url query is required');
    }
    const existing = await findPostBySourceUrl(url.trim());
    if (!existing) {
      return NextResponse.json({ isDuplicate: false });
    }
    return NextResponse.json({ isDuplicate: true, existingPost: existing });
  } catch (err) {
    return internalError(err, 'Failed to check duplicate');
  }
}
