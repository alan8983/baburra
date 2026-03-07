// GET /api/insights/popular-kols — Most followed KOLs (anonymous aggregation)

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getPopularKols } from '@/infrastructure/repositories';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { searchParams } = request.nextUrl;
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit')) || 10));

    const kols = await getPopularKols(limit);
    return NextResponse.json(kols);
  } catch (err) {
    return internalError(err, 'Failed to fetch popular KOLs');
  }
}
