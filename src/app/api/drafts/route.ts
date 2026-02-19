// GET /api/drafts - 我的草稿列表
// POST /api/drafts - 新增草稿

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listDraftsByUserId, createDraft } from '@/infrastructure/repositories';
import type { CreateDraftInput } from '@/domain/models';
import { parsePaginationParams } from '@/lib/api/pagination';
import { internalError } from '@/lib/api/error';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) {
      return NextResponse.json({ error: pagination.error }, { status: 400 });
    }
    const result = await listDraftsByUserId(userId, {
      page: pagination.data?.page,
      limit: pagination.data?.limit,
    });
    return NextResponse.json(result);
  } catch (err) {
    return internalError(err, 'Failed to fetch drafts');
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
    return internalError(err, 'Failed to create draft');
  }
}
