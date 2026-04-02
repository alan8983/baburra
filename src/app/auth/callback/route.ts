// Auth Callback Route
// 處理 Supabase Auth 的 OAuth callback 和 email 驗證
// Also sends post-registration emails (beta welcome / waitlist confirmation)

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { ROUTES } from '@/lib/constants';
import { sendEmail } from '@/infrastructure/email/resend.client';
import { BetaWelcomeEmail } from '@/infrastructure/email/templates/beta-welcome';
import { WaitlistConfirmEmail } from '@/infrastructure/email/templates/waitlist-confirm';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? ROUTES.INPUT;

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Get current user to send post-registration email
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Fire-and-forget: send email based on profile status
        sendPostRegistrationEmail(user.id, user.email ?? '', origin).catch(() => {});
      }

      // 成功驗證，導向目標頁面
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 驗證失敗，導向登入頁並顯示錯誤
  return NextResponse.redirect(`${origin}${ROUTES.LOGIN}?message=驗證失敗，請重新嘗試`);
}

async function sendPostRegistrationEmail(userId: string, email: string, origin: string) {
  if (!email) return;

  const adminClient = createAdminClient();
  if (!adminClient) return;

  const { data: profile } = await adminClient
    .from('profiles')
    .select('status, created_at')
    .eq('id', userId)
    .single();

  if (!profile) return;

  // Only send for profiles created in the last 5 minutes (new registrations)
  const createdAt = new Date(profile.created_at as string);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (createdAt < fiveMinutesAgo) return;

  if (profile.status === 'waitlisted') {
    // Get queue position
    const { count: position } = await adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waitlisted')
      .lt('created_at', profile.created_at);

    await sendEmail(
      email,
      "You're on the Baburra.io waitlist",
      WaitlistConfirmEmail({ position: (position ?? 0) + 1 })
    );
  } else if (profile.status === 'active') {
    await sendEmail(
      email,
      'Welcome to the Baburra.io Open Beta!',
      BetaWelcomeEmail({ scrapeUrl: `${origin}/scrape` })
    );
  }
}
