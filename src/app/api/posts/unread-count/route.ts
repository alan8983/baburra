// GET /api/posts/unread-count — count posts from subscribed KOLs since last viewed

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { getPostsLastViewedAt } from '@/infrastructure/repositories/profile.repository';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ count: 0 });
    }

    const lastViewed = await getPostsLastViewedAt(userId);
    if (!lastViewed) {
      return NextResponse.json({ count: 0 });
    }

    const supabase = createAdminClient();

    // Get KOL IDs user is subscribed to (via kol_subscriptions → kol_sources → kols)
    const { data: subs, error: subsError } = await supabase
      .from('kol_subscriptions')
      .select('kol_sources!inner(kol_id)')
      .eq('user_id', userId);

    if (subsError) throw subsError;

    const kolIds = (subs ?? []).map((s) => (s.kol_sources as unknown as { kol_id: string }).kol_id);

    if (kolIds.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    // Count posts from subscribed KOLs created after last viewed
    const { count, error: countError } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .in('kol_id', kolIds)
      .gt('created_at', lastViewed.toISOString());

    if (countError) throw countError;

    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    console.error('GET /api/posts/unread-count', err);
    return NextResponse.json({ count: 0 });
  }
}
