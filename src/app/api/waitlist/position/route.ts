import { NextResponse } from 'next/server';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { getCurrentUserId } from '@/infrastructure/supabase/server';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Check if user is actually waitlisted
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, created_at')
    .eq('id', userId)
    .single();

  if (!profile || profile.status !== 'waitlisted') {
    return NextResponse.json({ error: 'Not waitlisted' }, { status: 404 });
  }

  // Count users waitlisted before this user (position) and total waitlisted
  const { count: position } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'waitlisted')
    .lt('created_at', profile.created_at);

  const { count: total } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'waitlisted');

  return NextResponse.json({
    position: (position ?? 0) + 1,
    total: total ?? 0,
  });
}
