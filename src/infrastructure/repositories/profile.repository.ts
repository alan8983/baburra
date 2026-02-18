/**
 * Profile Repository — 用戶個人資料存取
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { UpdateProfileInput } from '@/domain/models/user';

const DEFAULT_TIMEZONE = 'Asia/Taipei';

/**
 * 取得用戶的時區設定
 */
export async function getUserTimezone(userId: string): Promise<string> {
  const supabase = createAdminClient();
  if (!supabase) {
    return DEFAULT_TIMEZONE;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return DEFAULT_TIMEZONE;
    }
    throw new Error(`Failed to get user timezone: ${error.message}`);
  }

  return data.timezone || DEFAULT_TIMEZONE;
}

/**
 * 取得用戶個人資料
 */
export async function getProfile(userId: string) {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      displayName: null,
      timezone: DEFAULT_TIMEZONE,
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        displayName: null,
        timezone: DEFAULT_TIMEZONE,
      };
    }
    throw new Error(`Failed to get profile: ${error.message}`);
  }

  return {
    displayName: data.display_name as string | null,
    timezone: (data.timezone as string) || DEFAULT_TIMEZONE,
  };
}

/**
 * 更新用戶個人資料
 */
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const updateData: Record<string, unknown> = {};
  if (input.displayName !== undefined) {
    updateData.display_name = input.displayName || null;
  }
  if (input.timezone !== undefined) {
    updateData.timezone = input.timezone;
  }

  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }
}
