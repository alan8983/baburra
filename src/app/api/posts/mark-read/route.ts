// PATCH /api/posts/mark-read — update posts_last_viewed_at to now

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { unauthorizedError, internalError } from '@/lib/api/error';
import { updatePostsLastViewedAt } from '@/infrastructure/repositories/profile.repository';

export async function PATCH() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return unauthorizedError();
    }

    await updatePostsLastViewedAt(userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return internalError(err, 'Failed to mark posts as read');
  }
}
