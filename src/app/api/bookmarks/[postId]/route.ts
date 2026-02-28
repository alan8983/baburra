// GET /api/bookmarks/[postId] - 檢查是否已加書籤
// DELETE /api/bookmarks/[postId] - 移除書籤

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { isBookmarked, removeBookmark } from '@/infrastructure/repositories';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();
    const { postId } = await params;
    const bookmarked = await isBookmarked(userId, postId);
    return NextResponse.json({ isBookmarked: bookmarked });
  } catch (err) {
    return internalError(err, 'Failed to check bookmark');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();
    const { postId } = await params;
    await removeBookmark(userId, postId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return internalError(err, 'Failed to remove bookmark');
  }
}
