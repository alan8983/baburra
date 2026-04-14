// GET /api/stocks/[ticker]/scorecard
//
// Read-through against `stock_scorecard_cache`. Mirrors the KOL scorecard
// endpoint: `status: 'ready'` on warm read, `status: 'computing'` on miss.

import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api/error';
import { CLASSIFIER_VERSION } from '@/domain/calculators';
import { getStockScorecard } from '@/infrastructure/repositories/scorecard-cache.repository';
import { enqueueStockScorecardCompute } from '@/domain/services/scorecard.service';
import { isScorecardCacheEnabled } from '@/lib/feature-flags';
import { createAdminClient } from '@/infrastructure/supabase/admin';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { ticker } = await context.params;
    const upper = ticker.toUpperCase();

    // Resolve ticker → stockId once per request.
    const supabase = createAdminClient();
    const { data: stock } = await supabase
      .from('stocks')
      .select('id')
      .eq('ticker', upper)
      .maybeSingle();
    if (!stock?.id) {
      return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
    }
    const stockId = stock.id as string;

    if (!isScorecardCacheEnabled()) {
      // Flag off: no cache, no legacy path exposed for this new endpoint.
      return NextResponse.json({ status: 'computing', computedAt: null });
    }

    const cached = await getStockScorecard(stockId, CLASSIFIER_VERSION);
    if (cached) {
      return NextResponse.json({
        status: 'ready',
        computedAt: cached.computedAt,
        day5: cached.day5,
        day30: cached.day30,
        day90: cached.day90,
        day365: cached.day365,
        bucketsByKol: cached.bucketsByKol,
      });
    }
    enqueueStockScorecardCompute(stockId);
    return NextResponse.json({ status: 'computing', computedAt: null });
  } catch (error) {
    return internalError(error, 'Failed to fetch stock scorecard');
  }
}
