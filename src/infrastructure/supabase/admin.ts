// Supabase Admin Client
// 用於需要 Service Role 權限的操作（繞過 RLS）
// 注意：只能在伺服器端使用

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `[Supabase Admin] 缺少必要的環境變數: ${missing.join(', ')}。` +
        '請在 .env.local 中設定這些變數，並重啟開發伺服器。'
    );
  }

  // TypeScript now knows these are defined after the validation above
  return createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
