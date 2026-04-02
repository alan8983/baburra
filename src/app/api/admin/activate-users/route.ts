import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { sendEmail } from '@/infrastructure/email/resend.client';
import { WaitlistActivatedEmail } from '@/infrastructure/email/templates/waitlist-activated';

export async function POST(request: NextRequest) {
  // Validate admin secret
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 500 });
  }

  const requestSecret = request.headers.get('x-admin-secret');
  if (requestSecret !== adminSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const body = await request.json();
  const { userIds, count } = body as { userIds?: string[]; count?: number };

  if (!userIds && !count) {
    return NextResponse.json({ error: 'Provide either userIds or count' }, { status: 400 });
  }

  let usersToActivate: { id: string; email: string }[] = [];

  if (userIds) {
    // Activate specific users
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('id', userIds)
      .eq('status', 'waitlisted');

    if (data && data.length > 0) {
      // Get emails from auth.users
      const ids = data.map((d) => d.id);
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const userMap = new Map(authUsers?.users?.map((u) => [u.id, u.email ?? '']) ?? []);
      usersToActivate = ids.map((id) => ({ id, email: userMap.get(id) ?? '' }));

      await supabase.from('profiles').update({ status: 'active' }).in('id', ids);
    }
  } else if (count) {
    // Activate next N waitlisted users by created_at order
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('status', 'waitlisted')
      .order('created_at', { ascending: true })
      .limit(count);

    if (data && data.length > 0) {
      const ids = data.map((d) => d.id);
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const userMap = new Map(authUsers?.users?.map((u) => [u.id, u.email ?? '']) ?? []);
      usersToActivate = ids.map((id) => ({ id, email: userMap.get(id) ?? '' }));

      await supabase.from('profiles').update({ status: 'active' }).in('id', ids);
    }
  }

  // Send activation emails (fire-and-forget)
  const origin = request.headers.get('origin') || request.nextUrl.origin;
  const loginUrl = `${origin}/login`;

  const emailPromises = usersToActivate
    .filter((u) => u.email)
    .map((u) =>
      sendEmail(
        u.email,
        "You're in! Your Baburra.io beta access is ready",
        WaitlistActivatedEmail({ loginUrl })
      )
    );

  await Promise.allSettled(emailPromises);

  return NextResponse.json({
    activated: usersToActivate.length,
    requested: userIds?.length ?? count ?? 0,
  });
}
