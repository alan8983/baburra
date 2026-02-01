// GET /api/stocks - 列表（支援 search, page, limit）
// POST /api/stocks - 新增標的

import { NextRequest, NextResponse } from 'next/server';
import { listStocks, createStock } from '@/infrastructure/repositories';
import type { CreateStockInput } from '@/domain/models';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const page = searchParams.get('page');
    const limit = searchParams.get('limit');
    const result = await listStocks({
      search: search || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/stocks', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch stocks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateStockInput;
    if (!body?.ticker?.trim() || !body?.name?.trim()) {
      return NextResponse.json({ error: 'ticker and name are required' }, { status: 400 });
    }
    const stock = await createStock(body);
    return NextResponse.json(stock);
  } catch (err) {
    console.error('POST /api/stocks', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create stock' },
      { status: 500 }
    );
  }
}
