// GET /api/kols/[id]/posts - KOL 的文章列表

import { NextRequest, NextResponse } from 'next/server';
import { listPosts } from '@/infrastructure/repositories';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page');
    const limit = searchParams.get('limit');
    const result = await listPosts({
      kolId: id,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/kols/[id]/posts', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}
