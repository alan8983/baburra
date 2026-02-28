// GET /api/drafts/[id] - 草稿詳情
// PATCH /api/drafts/[id] - 更新草稿
// DELETE /api/drafts/[id] - 刪除草稿

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getDraftById, updateDraft, deleteDraft } from '@/infrastructure/repositories';
import { unauthorizedError, notFoundError, internalError } from '@/lib/api/error';
import { updateDraftSchema, parseBody } from '@/lib/api/validation';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();
    const { id } = await params;
    const draft = await getDraftById(id, userId);
    if (!draft) return notFoundError('Draft');
    return NextResponse.json(draft);
  } catch (err) {
    return internalError(err, 'Failed to fetch draft');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();
    const { id } = await params;
    const parsed = await parseBody(request, updateDraftSchema);
    if ('error' in parsed) return parsed.error;
    const draft = await updateDraft(id, userId, parsed.data);
    if (!draft) return notFoundError('Draft');
    return NextResponse.json(draft);
  } catch (err) {
    return internalError(err, 'Failed to update draft');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();
    const { id } = await params;
    await deleteDraft(id, userId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return internalError(err, 'Failed to delete draft');
  }
}
