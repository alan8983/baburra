// GET /api/bookmarks - 我的書籤列表
// POST /api/bookmarks - 新增書籤

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listBookmarksByUserId, addBookmark } from '@/infrastructure/repositories';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page');
    const limit = searchParams.get('limit');
    const result = await listBookmarksByUserId(userId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/bookmarks', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch bookmarks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = (await request.json()) as { postId: string };
    if (!body.postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 });
    }
    const bookmark = await addBookmark(userId, body.postId);
    return NextResponse.json(bookmark);
  } catch (err) {
    console.error('POST /api/bookmarks', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add bookmark' },
      { status: 500 }
    );
  }
}
