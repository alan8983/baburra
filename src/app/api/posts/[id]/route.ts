// GET /api/posts/[id] - 文章詳情
// PATCH /api/posts/[id] - 更新文章
// DELETE /api/posts/[id] - 刪除文章

import { NextRequest, NextResponse } from 'next/server';
import { getPostById, updatePost, deletePost } from '@/infrastructure/repositories';
import type { UpdatePostInput } from '@/domain/models';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = await getPostById(id);
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    return NextResponse.json(post);
  } catch (err) {
    console.error('GET /api/posts/[id]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch post' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdatePostInput;
    const post = await updatePost(id, body);
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    return NextResponse.json(post);
  } catch (err) {
    console.error('PATCH /api/posts/[id]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update post' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deletePost(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('DELETE /api/posts/[id]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete post' },
      { status: 500 }
    );
  }
}
