/**
 * GET /api/stocks/[ticker]/prices
 * 取得標的股價（K 線 + 成交量），供 K 線圖使用。
 * 遵守 Agent B 邊界：此為唯一由 Phase 6 建立的股價 API。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockPrices } from '@/infrastructure/repositories/stock-price.repository';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await context.params;
  if (!ticker) {
    return NextResponse.json(
      { error: 'Missing ticker' },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') ?? undefined;
  const endDate = searchParams.get('endDate') ?? undefined;
  const includeVolumes = searchParams.get('includeVolumes') === '1';

  try {
    const { candles, volumes } = await getStockPrices(ticker, {
      startDate,
      endDate,
    });

    // 向後相容：未帶 includeVolumes=1 時只回傳 candles 陣列（既有 useStockPrices 用）
    if (!includeVolumes) {
      return NextResponse.json(candles);
    }
    return NextResponse.json({ candles, volumes });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch stock prices';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
