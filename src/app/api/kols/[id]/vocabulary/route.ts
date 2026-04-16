import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import {
  listVocabularyByKol,
  createVocabularyTerm,
  deleteVocabularyTerm,
} from '@/infrastructure/repositories';
import { unauthorizedError, badRequestError, internalError } from '@/lib/api/error';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const terms = await listVocabularyByKol(id);
    return NextResponse.json(terms);
  } catch (err) {
    return internalError(err, 'Failed to fetch vocabulary');
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { id } = await params;
    const body = await request.json();

    if (!body.pattern || !body.replacement) {
      return badRequestError('pattern and replacement are required');
    }

    const term = await createVocabularyTerm({
      kolId: id,
      pattern: body.pattern,
      replacement: body.replacement,
      isRegex: body.isRegex ?? false,
      category: body.category ?? 'kol_specific',
      note: body.note,
    });

    return NextResponse.json(term, { status: 201 });
  } catch (err) {
    return internalError(err, 'Failed to create vocabulary term');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    // Term id comes from query param
    const { searchParams } = new URL(request.url);
    const termId = searchParams.get('termId');
    if (!termId) return badRequestError('termId query parameter is required');

    // Ensure we're not ignoring the KOL id (for future RLS scoping)
    await params;

    await deleteVocabularyTerm(termId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError(err, 'Failed to delete vocabulary term');
  }
}
