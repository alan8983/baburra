// GET /api/stocks/[ticker] - 單一標的詳情（不含股價，股價由 Phase 6 的 /api/stocks/[ticker]/prices 負責）

import { NextRequest, NextResponse } from 'next/server';
import { getStockByTicker } from '@/infrastructure/repositories';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const stock = await getStockByTicker(decodeURIComponent(ticker));
    if (!stock) return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
    return NextResponse.json(stock);
  } catch (err) {
    console.error('GET /api/stocks/[ticker]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch stock' },
      { status: 500 }
    );
  }
}
