/**
 * GET /api/unlocks — list the current user's content unlocks.
 */

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { listUserUnlocks } from '@/domain/services/unlock.service';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const unlocks = await listUserUnlocks(userId);
    return NextResponse.json({
      unlocks: unlocks.map((u) => ({
        unlockType: u.unlockType,
        targetKey: u.targetKey,
        unlockedAt: u.unlockedAt.toISOString(),
      })),
    });
  } catch (err) {
    return internalError(err, 'Failed to fetch unlocks');
  }
}
