// GET /api/kols/[id]/posts - KOL 的文章列表

import { NextRequest, NextResponse } from 'next/server';
import { listPosts } from '@/infrastructure/repositories';
import { enrichPostsWithPriceChanges } from '@/lib/api/enrich-price-changes';
import { parsePaginationParams } from '@/lib/api/pagination';
import { errorResponse, internalError } from '@/lib/api/error';
import { getAiModelVersion } from '@/infrastructure/api/gemini.client';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    // Per R13 the KOL detail page asks for up to 1000 posts so the per-stock
    // aggregation reflects the same universe as `computeKolScorecard`.
    const pagination = parsePaginationParams(searchParams, { maxLimit: 1000 });
    if (pagination.error) {
      return errorResponse(400, 'BAD_REQUEST', pagination.error);
    }
    const result = await listPosts({
      kolId: id,
      page: pagination.data?.page,
      limit: pagination.data?.limit,
    });
    if (result.total > 500) {
      // Heads-up so we revisit before any KOL approaches the detail-page
      // limit=1000 cap (see openspec change kol-detail-consistency-qa-gate D1).
      console.warn(`[api/kols/${id}/posts] result.total=${result.total} > 500`);
    }
    await enrichPostsWithPriceChanges(result.data);
    return NextResponse.json({ ...result, currentAiModel: getAiModelVersion() });
  } catch (err) {
    return internalError(err, 'Failed to fetch posts');
  }
}
