/**
 * POST /api/unlocks/layer2 — unlock Layer 2 (KOL × ticker) deep dive.
 *
 * Body: { kolId: string, stockId: string }
 * Free: spends one monthly quota slot; 402 if exhausted.
 * Pro/Max: no-op success.
 */

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import {
  unlockLayer2,
  UpgradeRequiredError,
  InsufficientCreditsError,
} from '@/domain/services/unlock.service';
import { badRequestError, unauthorizedError, internalError, errorResponse } from '@/lib/api/error';

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const body = (await req.json().catch(() => null)) as {
      kolId?: string;
      stockId?: string;
    } | null;
    if (!body?.kolId || !body?.stockId) {
      return badRequestError('kolId and stockId are required');
    }

    const result = await unlockLayer2(userId, body.kolId, body.stockId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UpgradeRequiredError) {
      return errorResponse(402, 'UPGRADE_REQUIRED', err.message, {
        reason: err.reason,
        requiredTier: err.requiredTier,
      });
    }
    if (err instanceof InsufficientCreditsError) {
      return errorResponse(402, 'INSUFFICIENT_CREDITS', err.message, {
        required: err.required,
        available: err.available,
      });
    }
    return internalError(err, 'Failed to unlock layer 2');
  }
}
