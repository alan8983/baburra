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
      onboardingCompleted: false,
      onboardingCompletedAt: null,
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, timezone, onboarding_completed, onboarding_completed_at')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        displayName: null,
        timezone: DEFAULT_TIMEZONE,
        onboardingCompleted: false,
        onboardingCompletedAt: null,
      };
    }
    throw new Error(`Failed to get profile: ${error.message}`);
  }

  return {
    displayName: data.display_name as string | null,
    timezone: (data.timezone as string) || DEFAULT_TIMEZONE,
    onboardingCompleted: data.onboarding_completed === true,
    onboardingCompletedAt: data.onboarding_completed_at
      ? new Date(data.onboarding_completed_at as string)
      : null,
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

/**
 * 檢查用戶是否已使用免費的 onboarding 匯入
 */
export async function checkOnboardingImportUsed(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_import_used')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return false; // Profile not found — treat as not used (new user gets free import)
    }
    throw new Error(`Failed to check onboarding import status: ${error.message}`);
  }

  return data.onboarding_import_used === true;
}

/**
 * 標記用戶已完成 onboarding 流程
 */
export async function markOnboardingCompleted(userId: string): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to mark onboarding as completed: ${error.message}`);
  }
}

/**
 * 標記用戶已使用免費的 onboarding 匯入
 */
export async function markOnboardingImportUsed(userId: string): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error('Missing Supabase admin credentials');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_import_used: true })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to mark onboarding import as used: ${error.message}`);
  }
}
