// GET /api/bookmarks/[postId] - 檢查是否已加書籤
// DELETE /api/bookmarks/[postId] - 移除書籤

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { isBookmarked, removeBookmark } from '@/infrastructure/repositories';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { postId } = await params;
    const bookmarked = await isBookmarked(userId, postId);
    return NextResponse.json({ isBookmarked: bookmarked });
  } catch (err) {
    console.error('GET /api/bookmarks/[postId]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to check bookmark' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { postId } = await params;
    await removeBookmark(userId, postId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/bookmarks/[postId]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove bookmark' },
      { status: 500 }
    );
  }
}
