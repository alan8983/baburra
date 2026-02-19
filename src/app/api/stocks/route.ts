// GET /api/stocks - 列表（支援 search, page, limit）
// POST /api/stocks - 新增標的

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listStocks, createStock } from '@/infrastructure/repositories';
import { parsePaginationParams } from '@/lib/api/pagination';
import { internalError } from '@/lib/api/error';
import { createStockSchema, parseBody } from '@/lib/api/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }
    const result = await listStocks({
      search: search || undefined,
      page: pagination.data?.page,
      limit: pagination.data?.limit,
    });
    return NextResponse.json(result);
  } catch (err) {
    return internalError(err, 'Failed to fetch stocks');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const parsed = await parseBody(request, createStockSchema);
    if ('error' in parsed) return parsed.error;
    const stock = await createStock(parsed.data);
    return NextResponse.json(stock);
  } catch (err) {
    return internalError(err, 'Failed to create stock');
  }
}
