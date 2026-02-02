// GET /api/kols/[id] - 單一 KOL 詳情
// PATCH /api/kols/[id] - 更新 KOL

import { NextRequest, NextResponse } from 'next/server';
import { getKolById, updateKol } from '@/infrastructure/repositories';
import type { UpdateKOLInput } from '@/domain/models';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kol = await getKolById(id);
    if (!kol) return NextResponse.json({ error: 'KOL not found' }, { status: 404 });
    return NextResponse.json(kol);
  } catch (err) {
    console.error('GET /api/kols/[id]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch KOL' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdateKOLInput;
    const kol = await updateKol(id, body);
    if (!kol) return NextResponse.json({ error: 'KOL not found' }, { status: 404 });
    return NextResponse.json(kol);
  } catch (err) {
    console.error('PATCH /api/kols/[id]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update KOL' },
      { status: 500 }
    );
  }
}
