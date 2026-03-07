// GET /api/posts/stale-count — count posts not analyzed with current AI model version

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { findPostsByModelVersion } from '@/infrastructure/repositories/post.repository';
import { getAiModelVersion } from '@/infrastructure/api/gemini.client';
import { unauthorizedError, internalError } from '@/lib/api/error';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorizedError();

    const currentModel = getAiModelVersion();
    const stalePosts = await findPostsByModelVersion(currentModel, 100);

    return NextResponse.json({
      count: stalePosts.length,
      currentModel,
      postIds: stalePosts.map((p) => p.id),
    });
  } catch (err) {
    return internalError(err, 'Failed to get stale post count');
  }
}
