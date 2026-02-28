// GET /api/stocks/[ticker] - 單一標的詳情（不含股價，股價由 Phase 6 的 /api/stocks/[ticker]/prices 負責）

import { NextRequest, NextResponse } from 'next/server';
import { getStockByTicker } from '@/infrastructure/repositories';
import { notFoundError, internalError } from '@/lib/api/error';
import { enrichStocksWithReturnRate } from '@/lib/api/enrich-stock-return-rate';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const stock = await getStockByTicker(decodeURIComponent(ticker));
    if (!stock) return notFoundError('Stock');
    await enrichStocksWithReturnRate([stock]);
    return NextResponse.json(stock);
  } catch (err) {
    return internalError(err, 'Failed to fetch stock');
  }
}
