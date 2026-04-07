/**
 * POST /api/unlocks/layer3 — unlock Layer 3 (cross-KOL stock page).
 *
 * Body: { stockId: string }
 * Free: 402 tier_locked.
 * Pro: deducts UNLOCK_COSTS.layer3_stock_page credits, persistent.
 * Max: no-op success.
 */

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import {
  unlockLayer3,
  UpgradeRequiredError,
  InsufficientCreditsError,
} from '@/domain/services/unlock.service';
import { badRequestError, unauthorizedError, internalError, errorResponse } from '@/lib/api/error';

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const body = (await req.json().catch(() => null)) as { stockId?: string } | null;
    if (!body?.stockId) {
      return badRequestError('stockId is required');
    }

    const result = await unlockLayer3(userId, body.stockId);
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
    return internalError(err, 'Failed to unlock layer 3');
  }
}
