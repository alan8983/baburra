// Supabase Browser Client
// 用於客戶端元件
//
// [Production] Email Verification (Phase 11.5):
// Enable "Confirm email" in Supabase Dashboard → Authentication → Settings → Email Auth.
// When enabled, signUp returns a user without a session until the email is confirmed.
// The confirmation email links to /auth/callback, which exchanges the code for a session.
// The existing auth callback handler already supports this flow — no code changes needed.

import { createBrowserClient } from '@supabase/ssr';

// 使用占位符值讓 build 可以通過，運行時會因為無效憑證而失敗
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// 在開發/運行時檢查並警告缺少環境變數
if (
  typeof window !== 'undefined' &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
) {
  console.error(
    '[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Add them to your .env.local file or set them as repo secrets for CI.'
  );
}

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
