// GET /api/stocks/[ticker]/posts - 標的相關文章列表

import { NextRequest, NextResponse } from 'next/server';
import { listPosts } from '@/infrastructure/repositories';
import { enrichPostsWithPriceChanges } from '@/lib/api/enrich-price-changes';
import { parsePaginationParams } from '@/lib/api/pagination';
import { errorResponse, internalError } from '@/lib/api/error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const { searchParams } = new URL(request.url);
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) {
      return errorResponse(400, 'BAD_REQUEST', pagination.error);
    }
    const result = await listPosts({
      stockTicker: decodeURIComponent(ticker),
      page: pagination.data?.page,
      limit: pagination.data?.limit,
    });
    await enrichPostsWithPriceChanges(result.data);
    return NextResponse.json(result);
  } catch (err) {
    return internalError(err, 'Failed to fetch posts');
  }
}
