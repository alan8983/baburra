// GET /api/posts/[id] - 文章詳情
// PATCH /api/posts/[id] - 更新文章
// DELETE /api/posts/[id] - 刪除文章

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getPostById, updatePost, deletePost } from '@/infrastructure/repositories';
import { enrichPostsWithPriceChanges } from '@/lib/api/enrich-price-changes';
import { unauthorizedError, notFoundError, internalError } from '@/lib/api/error';
import { updatePostSchema, parseBody } from '@/lib/api/validation';
import { getAiModelVersion } from '@/infrastructure/api/gemini.client';

// 可見性：authenticated-public
// 任何登入使用者可讀任何 post（post 是 KOL 公開發表的投資觀點）
// 未來若加 private post 需在此處加 visibility 檢查
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const { id } = await params;
    const post = await getPostById(id);
    if (!post) return notFoundError('Post');
    await enrichPostsWithPriceChanges([post]);
    return NextResponse.json({ ...post, currentAiModel: getAiModelVersion() });
  } catch (err) {
    return internalError(err, 'Failed to fetch post');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const { id } = await params;
    const parsed = await parseBody(request, updatePostSchema);
    if ('error' in parsed) return parsed.error;
    const post = await updatePost(id, userId, parsed.data);
    if (!post) return notFoundError('Post');
    return NextResponse.json(post);
  } catch (err) {
    return internalError(err, 'Failed to update post');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const { id } = await params;
    const deleted = await deletePost(id, userId);
    if (!deleted) return notFoundError('Post');
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return internalError(err, 'Failed to delete post');
  }
}
