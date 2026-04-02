import { NextResponse } from 'next/server';
import { createAdminClient } from '@/infrastructure/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { count: activeUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  const cap = Number(process.env.USER_CAP) || 100;
  const active = activeUsers ?? 0;

  let status: 'open' | 'near_capacity' | 'full';
  if (active >= cap) {
    status = 'full';
  } else if (active >= cap * 0.8) {
    status = 'near_capacity';
  } else {
    status = 'open';
  }

  return NextResponse.json({ activeUsers: active, cap, status });
}
