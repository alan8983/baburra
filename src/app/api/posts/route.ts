// GET /api/posts - 文章列表
// POST /api/posts - 發布文章

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listPosts, createPost } from '@/infrastructure/repositories';
import type { CreatePostInput } from '@/domain/models';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const kolId = searchParams.get('kolId') ?? undefined;
    const stockTicker = searchParams.get('stockTicker') ?? undefined;
    const page = searchParams.get('page');
    const limit = searchParams.get('limit');
    const result = await listPosts({
      search: search || undefined,
      kolId,
      stockTicker,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/posts', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = (await request.json()) as CreatePostInput;
    if (!body?.kolId || !body?.content || body.sentiment === undefined || !body.postedAt) {
      return NextResponse.json(
        { error: 'kolId, content, sentiment, postedAt are required' },
        { status: 400 }
      );
    }
    const post = await createPost(body, userId);
    return NextResponse.json(post);
  } catch (err) {
    console.error('POST /api/posts', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create post' },
      { status: 500 }
    );
  }
}
