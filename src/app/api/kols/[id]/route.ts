// GET /api/kols/[id] - 單一 KOL 詳情
// PATCH /api/kols/[id] - 更新 KOL (supports validation status override)

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getKolById, updateKol, updateValidationStatus } from '@/infrastructure/repositories';
import { unauthorizedError, notFoundError, badRequestError, internalError } from '@/lib/api/error';
import { updateKolSchema, parseBody } from '@/lib/api/validation';
import type { ValidationStatus } from '@/domain/models';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kol = await getKolById(id);
    if (!kol) return notFoundError('KOL');
    return NextResponse.json(kol);
  } catch (err) {
    return internalError(err, 'Failed to fetch KOL');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }
    const { id } = await params;

    // Check for validation status override
    const body = await request.clone().json();
    if (body.validationStatus) {
      const kol = await getKolById(id);
      if (!kol) return notFoundError('KOL');

      const newStatus = body.validationStatus as ValidationStatus;
      // Only allow rejected → active override
      if (kol.validationStatus !== 'rejected' || newStatus !== 'active') {
        return badRequestError('Validation status override only supports: rejected → active');
      }

      await updateValidationStatus(id, 'active');
      const updated = await getKolById(id);
      return NextResponse.json(updated);
    }

    const parsed = await parseBody(request, updateKolSchema);
    if ('error' in parsed) return parsed.error;
    const kol = await updateKol(id, userId, parsed.data);
    if (!kol) return notFoundError('KOL');
    return NextResponse.json(kol);
  } catch (err) {
    return internalError(err, 'Failed to update KOL');
  }
}
