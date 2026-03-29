/**
 * Profile Repository — 用戶個人資料存取
 */

import { createAdminClient } from '@/infrastructure/supabase/admin';
import type { UpdateProfileInput, ColorPalette } from '@/domain/models/user';

const DEFAULT_TIMEZONE = 'Asia/Taipei';

import type { SubscriptionTier } from '@/domain/models/user';

export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const supabase = createAdminClient();
  if (!supabase) return 'free';

  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();

  if (error) return 'free';
  return (data?.subscription_tier as SubscriptionTier) || 'free';
}

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
      colorPalette: 'asian' as ColorPalette,
      firstImportFree: true,
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, timezone, color_palette, first_import_free')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        displayName: null,
        timezone: DEFAULT_TIMEZONE,
        colorPalette: 'asian' as ColorPalette,
        firstImportFree: true,
      };
    }
    throw new Error(`Failed to get profile: ${error.message}`);
  }

  return {
    displayName: data.display_name as string | null,
    timezone: (data.timezone as string) || DEFAULT_TIMEZONE,
    colorPalette: ((data.color_palette as string) || 'asian') as ColorPalette,
    firstImportFree: data.first_import_free === true,
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
  if (input.colorPalette !== undefined) {
    updateData.color_palette = input.colorPalette;
  }

  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }
}

/**
 * 檢查用戶是否仍有免費首次匯入額度
 */
export async function checkFirstImportFree(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  if (!supabase) {
    return true; // Default: new user gets free import
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('first_import_free')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return true; // Profile not found — treat as eligible (new user)
    }
    throw new Error(`Failed to check first import free status: ${error.message}`);
  }

  return data.first_import_free === true;
}

/**
 * 標記用戶已使用免費首次匯入
 */
export async function markFirstImportUsed(userId: string): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ first_import_free: false })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to mark first import as used: ${error.message}`);
  }
}

/**
 * 取得用戶最後查看文章的時間
 */
export async function getPostsLastViewedAt(userId: string): Promise<Date | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('posts_last_viewed_at')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get posts_last_viewed_at: ${error.message}`);
  }

  return data.posts_last_viewed_at ? new Date(data.posts_last_viewed_at as string) : null;
}

/**
 * 更新用戶最後查看文章的時間為現在
 */
export async function updatePostsLastViewedAt(userId: string): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ posts_last_viewed_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to update posts_last_viewed_at: ${error.message}`);
  }
}
