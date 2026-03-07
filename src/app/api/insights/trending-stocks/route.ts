// GET /api/insights/trending-stocks — Trending stocks by post count (anonymous aggregation)

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getTrendingStocks } from '@/infrastructure/repositories';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { searchParams } = request.nextUrl;
    const days = Math.max(1, Math.min(90, Number(searchParams.get('days')) || 7));
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit')) || 10));

    const stocks = await getTrendingStocks(days, limit);
    return NextResponse.json(stocks);
  } catch (err) {
    return internalError(err, 'Failed to fetch trending stocks');
  }
}
