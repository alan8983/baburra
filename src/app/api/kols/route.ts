// GET /api/kols - 列表（支援 search, page, limit）
// POST /api/kols - 新增 KOL

import { NextRequest, NextResponse } from 'next/server';
import { listKols, createKol } from '@/infrastructure/repositories';
import type { CreateKOLInput } from '@/domain/models';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') ?? undefined;
    const page = searchParams.get('page');
    const limit = searchParams.get('limit');
    const result = await listKols({
      search: search || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/kols', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch KOLs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateKOLInput;
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const kol = await createKol(body);
    return NextResponse.json(kol);
  } catch (err) {
    console.error('POST /api/kols', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create KOL' },
      { status: 500 }
    );
  }
}
