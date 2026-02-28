// GET /api/bookmarks - 我的書籤列表
// POST /api/bookmarks - 新增書籤

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listBookmarksByUserId, addBookmark } from '@/infrastructure/repositories';
import { parsePaginationParams } from '@/lib/api/pagination';
import { unauthorizedError, internalError, errorResponse } from '@/lib/api/error';
import { addBookmarkSchema, parseBody } from '@/lib/api/validation';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const { searchParams } = new URL(request.url);
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) {
      return errorResponse(400, 'BAD_REQUEST', pagination.error);
    }
    const result = await listBookmarksByUserId(userId, {
      page: pagination.data?.page,
      limit: pagination.data?.limit,
    });
    return NextResponse.json(result);
  } catch (err) {
    return internalError(err, 'Failed to fetch bookmarks');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const parsed = await parseBody(request, addBookmarkSchema);
    if ('error' in parsed) return parsed.error;
    const bookmark = await addBookmark(userId, parsed.data.postId);
    return NextResponse.json(bookmark);
  } catch (err) {
    return internalError(err, 'Failed to add bookmark');
  }
}
