// Auth Callback Route
// 處理 Supabase Auth 的 OAuth callback 和 email 驗證

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/infrastructure/supabase/server';
import { ROUTES } from '@/lib/constants';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? ROUTES.DASHBOARD;

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 成功驗證，導向目標頁面
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 驗證失敗，導向登入頁並顯示錯誤
  return NextResponse.redirect(`${origin}${ROUTES.LOGIN}?message=驗證失敗，請重新嘗試`);
}
