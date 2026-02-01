// GET /api/posts/check-duplicate?url=... - 檢查重複 URL

import { NextRequest, NextResponse } from 'next/server';
import { findPostBySourceUrl } from '@/infrastructure/repositories';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url?.trim()) {
      return NextResponse.json({ error: 'url query is required' }, { status: 400 });
    }
    const existing = await findPostBySourceUrl(url.trim());
    if (!existing) {
      return NextResponse.json({ isDuplicate: false });
    }
    return NextResponse.json({ isDuplicate: true, existingPost: existing });
  } catch (err) {
    console.error('GET /api/posts/check-duplicate', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to check duplicate' },
      { status: 500 }
    );
  }
}
