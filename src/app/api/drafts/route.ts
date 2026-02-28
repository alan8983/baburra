// GET /api/drafts - 我的草稿列表
// POST /api/drafts - 新增草稿

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listDraftsByUserId, createDraft } from '@/infrastructure/repositories';
import { parsePaginationParams } from '@/lib/api/pagination';
import { unauthorizedError, internalError, errorResponse } from '@/lib/api/error';
import { createDraftSchema, parseBody } from '@/lib/api/validation';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const { searchParams } = new URL(request.url);
    const pagination = parsePaginationParams(searchParams);
    if (pagination.error) {
      return errorResponse(400, 'BAD_REQUEST', pagination.error);
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
      return unauthorizedError();
    }
    const parsed = await parseBody(request, createDraftSchema);
    if ('error' in parsed) return parsed.error;
    const draft = await createDraft(userId, parsed.data);
    return NextResponse.json(draft);
  } catch (err) {
    return internalError(err, 'Failed to create draft');
  }
}
