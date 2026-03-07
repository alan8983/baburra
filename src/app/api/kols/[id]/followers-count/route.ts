// GET /api/kols/[id]/followers-count — Follower count for a KOL (anonymous aggregation)

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getKolFollowerCount } from '@/infrastructure/repositories';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const { id } = await params;
    const followerCount = await getKolFollowerCount(id);
    return NextResponse.json({ kolId: id, followerCount });
  } catch (err) {
    return internalError(err, 'Failed to fetch follower count');
  }
}
