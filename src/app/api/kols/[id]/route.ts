// GET /api/kols/[id] - 單一 KOL 詳情
// PATCH /api/kols/[id] - 更新 KOL

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getKolById, updateKol } from '@/infrastructure/repositories';
import { internalError } from '@/lib/api/error';
import { updateKolSchema, parseBody } from '@/lib/api/validation';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kol = await getKolById(id);
    if (!kol) return NextResponse.json({ error: 'KOL not found' }, { status: 404 });
    return NextResponse.json(kol);
  } catch (err) {
    return internalError(err, 'Failed to fetch KOL');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const parsed = await parseBody(request, updateKolSchema);
    if ('error' in parsed) return parsed.error;
    const kol = await updateKol(id, parsed.data);
    if (!kol) return NextResponse.json({ error: 'KOL not found' }, { status: 404 });
    return NextResponse.json(kol);
  } catch (err) {
    return internalError(err, 'Failed to update KOL');
  }
}
