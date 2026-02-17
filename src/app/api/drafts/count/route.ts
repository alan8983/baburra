// GET /api/drafts/count - 草稿數量（供 sidebar badge 使用）

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/admin';

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ count: 0 });
    }

    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from('drafts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) throw error;
    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    console.error('GET /api/drafts/count', err);
    return NextResponse.json({ count: 0 });
  }
}
