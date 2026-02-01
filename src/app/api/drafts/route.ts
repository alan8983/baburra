// GET /api/drafts - 我的草稿列表
// POST /api/drafts - 新增草稿

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listDraftsByUserId, createDraft } from '@/infrastructure/repositories';
import type { CreateDraftInput } from '@/domain/models';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page');
    const limit = searchParams.get('limit');
    const result = await listDraftsByUserId(userId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/drafts', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch drafts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = (await request.json()) as CreateDraftInput;
    const draft = await createDraft(userId, body ?? {});
    return NextResponse.json(draft);
  } catch (err) {
    console.error('POST /api/drafts', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create draft' },
      { status: 500 }
    );
  }
}
