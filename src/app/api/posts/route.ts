// GET /api/posts - 文章列表
// POST /api/posts - 發布文章

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listPosts, createPost } from '@/infrastructure/repositories';
import { enrichPostsWithPriceChanges } from '@/lib/api/enrich-price-changes';
import { parsePaginationParams } from '@/lib/api/pagination';
import { internalError } from '@/lib/api/error';
import { createPostSchema, parseBody } from '@/lib/api/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const kolId = searchParams.get('kolId') ?? undefined;
    const stockTicker = searchParams.get('stockTicker') ?? undefined;
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }
    const result = await listPosts({
      search: search || undefined,
      kolId,
      stockTicker,
      page: pagination.data?.page,
      limit: pagination.data?.limit,
    });
    await enrichPostsWithPriceChanges(result.data);
    return NextResponse.json(result);
  } catch (err) {
    return internalError(err, 'Failed to fetch posts');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const parsed = await parseBody(request, createPostSchema);
    if ('error' in parsed) return parsed.error;
    const post = await createPost(parsed.data, userId);
    return NextResponse.json(post);
  } catch (err) {
    return internalError(err, 'Failed to create post');
  }
}
