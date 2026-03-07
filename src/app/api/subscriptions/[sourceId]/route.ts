/**
 * Subscription Delete API
 * DELETE /api/subscriptions/[sourceId] — Unsubscribe from a KOL source
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { unsubscribe, hasSubscribers } from '@/infrastructure/repositories';
import { disableMonitoring } from '@/infrastructure/repositories/kol-source.repository';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { sourceId } = await params;
    await unsubscribe(userId, sourceId);

    // Auto-disable monitoring if no subscribers remain
    const stillHasSubscribers = await hasSubscribers(sourceId);
    if (!stillHasSubscribers) {
      await disableMonitoring(sourceId);
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return internalError(err, 'Failed to unsubscribe');
  }
}
